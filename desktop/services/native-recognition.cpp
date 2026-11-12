// Build against the unmodified whisper.cpp v1.9.2 (306c88f4...) headers.
// The only transport is inherited anonymous pipes; no listener or file API.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <cstdint>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include "whisper.h"
#include "ggml-backend.h"
#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_DEVICE_IO
#define MA_NO_ENGINE
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_ENCODING
#define MA_NO_STDIO
#include "miniaudio.h"

static std::atomic<bool> used_vulkan{false};
static void log_message(enum ggml_log_level, const char * text, void *) {
    if (std::strstr(text, "whisper_backend_init_gpu: using Vulkan0 backend")) used_vulkan = true;
    std::fputs(text, stderr);
}

static std::string utf8(const std::wstring & text) {
    const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), (int) text.size(), nullptr, 0, nullptr, nullptr);
    if (!size) throw std::runtime_error("Invalid native path.");
    std::string value(size, '\0');
    WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text.data(), (int) text.size(), value.data(), size, nullptr, nullptr);
    return value;
}

template<typename T> static T symbol(HMODULE library, const char * name) {
    const auto address = GetProcAddress(library, name);
    if (!address) throw std::runtime_error("Pinned native API is unavailable.");
    return reinterpret_cast<T>(address);
}
#define API(library, name) const auto name = symbol<decltype(&::name)>(library, #name)

static std::string json_string(const char * text) {
    std::ostringstream out;
    out << '"';
    for (const unsigned char * p = (const unsigned char *) text; *p; ++p) {
        if (*p == '"' || *p == '\\') out << '\\' << (char) *p;
        else if (*p < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (unsigned) *p << std::dec;
        else out << (char) *p;
    }
    out << '"';
    return out.str();
}

static uint32_t u32(const unsigned char * p) {
    return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24;
}
static uint16_t u16(const unsigned char * p) { return uint16_t(p[0]) | uint16_t(p[1]) << 8; }
static bool read_exact(void * target, size_t size) {
    return std::fread(target, 1, size, stdin) == size;
}

static std::vector<float> decode(const std::vector<unsigned char> & wave) {
    const auto p = wave.data();
    const auto size = wave.size();
    if (size < 46 || size > 28800044 || std::memcmp(p, "RIFF", 4) || std::memcmp(p + 8, "WAVEfmt ", 8) ||
        u32(p + 4) != size - 8 || u32(p + 16) != 16 || u16(p + 20) != 1 || u16(p + 22) != 1 ||
        u16(p + 32) != 2 || u16(p + 34) != 16 || std::memcmp(p + 36, "data", 4) ||
        u32(p + 40) != size - 44 || (size - 44) % 2) throw std::runtime_error("Invalid PCM input.");
    const auto rate = u32(p + 24);
    if (rate < 8000 || rate > 48000 || u32(p + 28) != rate * 2 ||
        size - 44 > size_t(rate) * 2 * 300) throw std::runtime_error("Input exceeds the five-minute limit.");
    // Same pinned miniaudio decoder/resampler as the upstream CLI.
    auto config = ma_decoder_config_init(ma_format_f32, 1, WHISPER_SAMPLE_RATE);
    ma_decoder decoder;
    if (ma_decoder_init_memory(p, size, &config, &decoder) != MA_SUCCESS) throw std::runtime_error("PCM decoding failed.");
    std::vector<float> samples(WHISPER_SAMPLE_RATE * 300);
    ma_uint64 frames = 0;
    const auto status = ma_decoder_read_pcm_frames(&decoder, samples.data(), samples.size(), &frames);
    ma_decoder_uninit(&decoder);
    if ((status != MA_SUCCESS && status != MA_AT_END) || !frames || frames > samples.size()) throw std::runtime_error("PCM decoding failed.");
    const double expected = double((size - 44) / 2) * WHISPER_SAMPLE_RATE / rate;
    if (std::abs(double(frames) - expected) > 2) throw std::runtime_error("PCM resampling did not consume the complete input.");
    samples.resize((size_t) frames);
    return samples;
}

int wmain(int argc, wchar_t ** argv) {
    try {
        if (argc != 4 || (std::wcscmp(argv[2], L"cpu") && std::wcscmp(argv[2], L"vulkan"))) return 2;
        _setmode(_fileno(stdin), _O_BINARY);
        _setmode(_fileno(stdout), _O_BINARY);
        const DWORD parent_id = std::wcstoul(argv[3], nullptr, 10);
        const HANDLE parent = OpenProcess(SYNCHRONIZE, FALSE, parent_id);
        if (!parent) throw std::runtime_error("Cannot monitor the owning host.");
        std::thread([parent]() { WaitForSingleObject(parent, INFINITE); ExitProcess(3); }).detach();
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
        if (!SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32)) return 2;
        _wputenv_s(L"GGML_BACKEND_PATH", L"");
        wchar_t executable[32768];
        const DWORD length = GetModuleFileNameW(nullptr, executable, 32768);
        if (!length || length >= 32768) return 2;
        const std::wstring directory = std::wstring(executable, length).substr(0, std::wstring(executable, length).find_last_of(L"\\"));
        auto load = [&](const wchar_t * name) {
            HMODULE library = LoadLibraryExW((directory + L"\\" + name).c_str(), nullptr,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
            if (!library) throw std::runtime_error("Pinned native dependency could not load.");
            return library;
        };
        const auto ggml = load(L"ggml.dll");
        API(ggml, ggml_backend_load_all_from_path);
        ggml_backend_load_all_from_path(utf8(directory).c_str());
        const auto library = load(L"whisper.dll");
        API(library, whisper_log_set);
        API(library, whisper_context_default_params);
        API(library, whisper_init_from_file_with_params);
        API(library, whisper_full_default_params);
        API(library, whisper_full);
        API(library, whisper_full_n_segments);
        API(library, whisper_full_get_segment_text);
        API(library, whisper_full_n_tokens);
        API(library, whisper_full_get_token_id);
        API(library, whisper_full_get_token_p);
        API(library, whisper_full_lang_id);
        API(library, whisper_lang_str);
        API(library, whisper_free);
        whisper_log_set(log_message, nullptr);
        const bool vulkan = !std::wcscmp(argv[2], L"vulkan");
        auto context_params = whisper_context_default_params();
        context_params.use_gpu = vulkan;
        context_params.gpu_device = 0;
        auto context = whisper_init_from_file_with_params(utf8(argv[1]).c_str(), context_params);
        if (!context) throw std::runtime_error("Local model initialization failed.");
        if (vulkan && !used_vulkan.load()) { whisper_free(context); throw std::runtime_error("Selected Vulkan backend was not observed; no fallback is permitted."); }
        std::cout << "{\"type\":\"ready\",\"protocol\":1,\"backend\":\"" << (vulkan ? "vulkan" : "cpu") << "\"}\n" << std::flush;
        unsigned char header[16];
        while (read_exact(header, sizeof(header))) {
            const auto id = u32(header + 4), language = u32(header + 8), size = u32(header + 12);
            if (std::memcmp(header, "ICR1", 4) || !id || language > 2 || size < 46 || size > 28800044) return 2;
            std::vector<unsigned char> wave(size);
            if (!read_exact(wave.data(), size)) return 2;
            auto samples = decode(wave);
            auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
            params.n_threads = 4;
            params.no_context = true;
            params.no_timestamps = true;
            params.print_progress = params.print_realtime = params.print_timestamps = params.print_special = false;
            params.translate = false;
            params.language = language == 1 ? "en" : language == 2 ? "hi" : "auto";
            params.greedy.best_of = 1;
            if (whisper_full(context, params, samples.data(), (int) samples.size())) throw std::runtime_error("Local recognition failed.");
            const auto lang = whisper_lang_str(whisper_full_lang_id(context));
            if (!lang) throw std::runtime_error("Invalid recognition language.");
            std::ostringstream output;
            output << std::setprecision(9) << "{\"id\":" << id << ",\"inputSamples\":" << samples.size()
                   << ",\"result\":{\"language\":" << json_string(lang) << "},\"transcription\":[";
            const int segments = whisper_full_n_segments(context);
            if (segments < 0 || segments > 1000) throw std::runtime_error("Native segment bound exceeded.");
            for (int i = 0; i < segments; ++i) {
                if (i) output << ',';
                output << "{\"text\":" << json_string(whisper_full_get_segment_text(context, i)) << ",\"tokens\":[";
                const int tokens = whisper_full_n_tokens(context, i);
                if (tokens < 0 || tokens > 10000) throw std::runtime_error("Native token bound exceeded.");
                for (int j = 0; j < tokens; ++j) {
                    if (j) output << ',';
                    output << "{\"id\":" << whisper_full_get_token_id(context, i, j) << ",\"p\":" << whisper_full_get_token_p(context, i, j) << '}';
                }
                output << "]}";
                if (output.tellp() > 2 * 1024 * 1024) throw std::runtime_error("Native result bound exceeded.");
            }
            output << "]}";
            if (output.tellp() > 2 * 1024 * 1024) throw std::runtime_error("Native result bound exceeded.");
            std::cout << output.str() << '\n' << std::flush;
        }
        whisper_free(context);
        return 0;
    } catch (const std::exception & error) {
        std::fprintf(stderr, "%s\n", error.what());
        return 2;
    }
}
