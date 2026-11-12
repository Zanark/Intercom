# Speech options: research before selection

**Functional-slice supersession (2026-11-11):** the owner now approves a stronger
local recognition runtime/model download for English and Hindi/Hinglish, with
Roman-script output. A separately restricted Copilot controller may normalize
transcript text and interpret requests; audio remains on-device. TTS improvement
is deferred. The Windows-only prototype and its confidence score below are
historical baseline evidence, not the desired final speech quality. Exact model,
human code-switching accuracy and local latency remain qualification work.

**Final product decision pending.** The user subsequently selected a bounded
prototype using installed Windows en-US `System.Speech` recognition and local
English playback, with click-on/click-off capture and no model download.
Synthetic English recognition is verified, including phrases separated by
pauses; physical-microphone and human listening acceptance remain open.
No cloud audio/provider trial occurred. See [prototype](../prototype/prototype.md).
The following comparative research was checked 2026-11-10; availability,
pricing and data terms must be rechecked at final selection.

**Product priority:** performance/speed first and default, with user-selectable
priorities. Neither local nor cloud speech is presumed faster without evidence.

## Local multilingual candidate: connected in source

The approved investigation has downloaded and SHA-256 verified whisper.cpp
v1.9.2 CPU/BLAS binaries and the multilingual `large-v3-turbo-q5_0` model.
`desktop/services/recognition.cjs` supplies the integrity-checked adapter now
wired into `VoiceHost.transcribe`. **Input > Recognition** selects an external
prepared model/runtime folder through a native host dialog; configuration is
atomic and survives restart. Local .14 packages the model and six pinned Vulkan
binaries with whisper.cpp/OpenAI notices. Fresh packaged profiles select the
included engine and automatic language detection without a folder picker;
symbolic bundle preferences survive changing portable extraction paths.
Source runs without a bundle still need a prepared folder. The historical
Windows engine is available through explicit legacy selection. There is no
automatic installer or silent Windows/CPU fallback. Setup failures
preserve the draft and refuse recording before opening the microphone.
Intercom interpretation handles Roman output/filler cleanup; legacy destinations
do not. Human code-switching acceptance remains unfinished.

On Windows, the pinned CLI's `--output-file -` opens `CON`, not redirected
stdout. Consequently, exit zero plus empty captured stdout did not qualify
transcription. The adapter instead feeds WAV through stdin and receives bounded
JSON through a unique owned named pipe. It handles split UTF-8, output completion,
malformed/empty results, artifact mismatch and cancellation without saving audio
or transcript files. Native execution retains owned-process cleanup; four-thread
BLAS settings are explicit. It reports token probability separately, never
pretending it is calibrated recognition confidence or consuming the CLI's
unqualified segment timestamps.

Synthetic evidence on the development machine: a 12.615-second English
X/Y/Z orchestration example preserved targets, the conditional follow-up and
“do not check Y,” with punctuation differences and fillers still present.
The initial BLAS run took 19,382 ms; the hardened adapter run, including artifact
verification, took 22,162 ms. These are individual cold observations, not a
controlled performance comparison, human microphone result or acceptable
speed-first qualification. These are historical adapter observations, before
source activation.

### Warm recognition in local .16

Normal recording now uses `desktop/services/native-recognition.cjs` and the
owned `intercom-recognition.exe` helper, not a fresh CLI/model process per
draft. Preflight verifies the model and exact runtime hashes, starts a private
inherited-pipe worker, and waits for actual model readiness before opening the
microphone. Drafts and complete final recordings reuse that same process/model.
The pinned CLI/named-pipe path above remains an explicit diagnostic path.

The helper dynamically resolves whisper.cpp v1.9.2 APIs from its exact pinned
DLL set and uses upstream miniaudio v0.11.24 for complete memory decoding/
resampling. Language is auto/English/Hindi without translation; decoding
context resets between requests. Four recognition threads remain explicit.
Vulkan readiness requires the pinned runtime's actual Vulkan initialization
diagnostic; a CPU fallback is an error. CPU is a separate explicit configuration.
The model stays resident until shutdown, engine change or cancellation.
This trades idle memory for avoiding repeated initialization; idle RAM and
controlled cold/warm performance comparisons are not yet qualified.

There is no network listener, audio-device access or helper file-loading API
beyond its host-supplied startup model path. Audio/results travel over anonymous
pipes and memory, not application audio/transcript files. Buffers are not
securely zeroized; OS paging/crash dumps are not prevented. Request IDs, bounded
output, startup/recognition deadlines and exact cancellation reject late data.
Cancellation stops this exact worker, waits up to five seconds and blocks reuse
if cleanup fails; the next explicit request reloads without replay. Unexpected
idle exit is surfaced before retry. The helper also exits if its parent dies;
ordinary shutdown awaits `VoiceHost.close()`.

Observed once on the development machine: Vulkan readiness 2,337 ms, two
eight-second drafts 1,685/1,606 ms, and a complete 300-second repeated consented
input 17,222 ms with 4,800,000 decoded samples. The same PID served drafts and
complete input. Cancellation took 192 ms, its exact PID exited, and replacement
readiness took 1,293 ms. CPU readiness was 2,235 ms. These are individual native
observations, not a controlled comparison, natural five-minute accuracy test,
human microphone acceptance or generic GPU qualification.

The complete voice suite passes 50/51: the unchanged installed-Windows test
recognizes synthetic "please" as "police". This legacy-engine accuracy failure
is retained, not hidden by weakening the assertion or substituting another
engine. Warm-worker, integrity, timeout, cancellation, stale-output, engine
change and shutdown cases pass. The bundled engine is qualified separately
through the exact portable build.

Helper SHA-256:
`301beb02a6b303cd0344810c00d507ffdeca7536e4495c2b40772b7013f5c48b`
(588,288 bytes). It was built from `desktop/services/native-recognition.cpp`
against unmodified source commit
`306c88f4d1286aec1bf96e544632897886af5501`. Miniaudio uses its MIT-0 alternative;
its notice accompanies the independent required whisper/model notices.
The actual build invocation from the repository root was:

```powershell
& $env:ComSpec /c 'call "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" >nul && cl /nologo /std:c++17 /O2 /MT /EHsc /DNDEBUG /Brepro /I ".local\speech-qualification\source\whisper.cpp-306c88f4d1286aec1bf96e544632897886af5501\include" /I ".local\speech-qualification\source\whisper.cpp-306c88f4d1286aec1bf96e544632897886af5501\ggml\include" /I ".local\speech-qualification\source\whisper.cpp-306c88f4d1286aec1bf96e544632897886af5501\examples" desktop\services\native-recognition.cpp /Fo.local\speech-qualification\native-recognition.obj /Fe.local\speech-qualification\vulkan-engine\runtime\intercom-recognition.exe /link /INCREMENTAL:NO /Brepro'
```

This records the build procedure, not a byte-reproducibility claim: the exact
compiler/toolchain version was not captured.

### Microphone diagnostics and local-only speech check

Current source now exposes a measured two-second selected-device check,
saved `auto` / `en` / `hi` recognition hints, and a separate **Input > Speech
check**. The microphone check reports browser source rate, AudioContext PCM
rate, RMS and peak; silence and substantial clipping are explicit failures.
It cannot establish the physical microphone's ADC resolution or audio quality.
Speech check runs actual local recognition but never sends work or replaces
the working draft. It shows raw text and measured capture/recognition details;
Hindi may remain in original script until normal Intercom interpretation.

Three recording cases, all 34 speech cases, lint/build and 13 targeted
offscreen desktop cases pass. Coverage includes no-send/draft retention,
cancelled late output, visible cleanup failure with released UI ownership,
persisted language and a browser-reported 8kHz source
resampled to 16kHz that still cannot bypass review. Disposable synthetic media
and hidden windows are not physical-device or visible-window qualification.
A separate synthetic-file capture traversed the actual renderer/native Vulkan
route with no dispatch, provider call or draft replacement. Its transcript
preserved X/Y but repeated the start of the phrase; this is not perfect accuracy.

Fresh synthetic native observations for the same 4.58-second phrase:
auto/16kHz 6,645ms, English/16kHz 3,546ms, English/8kHz 3,354ms.
Both 16kHz transcripts preserved X/Y. At 8kHz, Y still became "why" with
token probability about .852, **now requiring review with an explicit warning**.
The host guards low-rate WAV; the renderer independently guards low reported
source rate even after resampling. This safety mitigation supersedes the
initial no-review behavior below, not the failed exact-name quality gate.
These uncontrolled observations are not a language-hint speed benchmark or
speed-first acceptance. Prepared-folder installation, portable Vulkan,
human English/Hindi/Hinglish and FDUCE qualification remain open.

### Activated native evidence and failed quality gate

Actual `VoiceHost` setup, restart persistence and transcription now run against
both pinned CPU/BLAS and the six-file development Vulkan runtime. A 4.58-second
synthetic English request was exercised at 8,000 / 16,000 / 44,100 / 48,000 Hz
through Vulkan; the CLI's in-memory decoder performed conversion. Observed
wall times were 7,041 / 7,085 / 5,161 / 5,412 ms respectively. CPU at 16,000 Hz
took 31,280 ms. These individual, uncontrolled-cache observations include host
work; they are not latency distributions or a speed-first pass.

The 16 / 44.1 / 48 kHz Vulkan and 16 kHz CPU transcripts preserved "refresh
session X" and "do not check session Y". **The 8 kHz transcript instead said
"do not check session why", with token probability 0.852 and no review flag
in that initial activation run.**
The exact-name assertion remains failed. This directly demonstrates why token
probability is not a reliable accuracy guarantee; do not claim impeccable
recognition or silently rewrite uncertain targets. Actual request cancellation
terminated only the observed owned Vulkan child, verified its PID exited and
released the host slot. No microphone, playback or provider task was involved.

The first activation attempt also found that `--no-prints` suppresses the GPU
diagnostic itself. GPU execution now leaves that diagnostic enabled; a unit
regression checks this argument and split diagnostic handling. Absence of the
required Vulkan backend report still rejects the result, not a CPU fallback.
All 31 speech cases, eight renderer cases, 38 host cases, lint/build and all
33 desktop cases pass (30 in the full run, then the three corrected uncertainty
copy assertions). These do not override the failed native exact-name gate.

`npm run test:voice` covers the new transport, integrity and uncertainty cases
alongside the existing native voice suite. A separate fictional-text Copilot
interpreter can authenticate and remove fillers while retaining an exclusion,
without observed tool execution. However, prompt-mode startup still reports
inherited enabled skill metadata despite the isolated profile's disabled
inventory. That CLI-only path remains unqualified. The separate SDK qualification
below supersedes this blocker for the tested configuration; neither path has
received a real session catalog or orchestration task.

### AMD Vulkan and restricted SDK qualification

The same pinned whisper.cpp source was built unchanged with Vulkan enabled.
A nested MSBuild tracking-file path failed under the original long build root;
shortening the project-owned build path fixed it without changing upstream
source, global long-path policy, drivers or the user's running application.
The verified LunarG SDK was copied into ignored local storage using its
documented copy-only installation; the checked user/machine environment values
remained unchanged.

The first Vulkan synthetic observation took 7,275 ms. A subsequent fresh-process
diagnostic run took 4,064 ms for the same 12.615-second input. Initialization
explicitly reported `using Vulkan0 backend` on the AMD Radeon 780M and allocated
the 573.40 MB model there. This establishes actual accelerated inference, not
just device enumeration. The later observation may benefit from driver/file
caches; neither result is a controlled comparison, latency distribution or
human English/Hinglish acceptance. Fillers remain in the recognized text.
The six compiled native files have recorded SHA-256 values, but their runtime
dependency/redistribution and portable deployment checks are still pending.
The source adapter now selects and verifies either pinned manifest. The local
Vulkan build has `GGML_NATIVE=ON`, so it is machine-optimized, **not qualified
as a generic Windows x64 redistributable**. Dependency/license review,
`GGML_NATIVE=OFF` distribution work and other-machine checks remain open.

Published `@github/copilot-sdk@1.0.31` was installed only in a private qualification
workspace, without install scripts or optional bundled runtimes. Its metadata
targets the already installed Copilot CLI 1.0.109. Against that executable,
`mode: "empty"`, an owned home/workspace, explicit empty tool/agent/skill lists,
disabled discovery/hooks/memory/session-store features and denied permissions
authenticated without copying credentials. A model-free inventory returned no
skills, configured MCP servers or offered tools.

The first fictional model turn exposed an important additional gate: the
built-in GitHub MCP connected during model initialization despite the startup
CLI flag and empty preflight inventory. Explicit session-level
`disabledMcpServers: ["github-mcp-server"]` fixed the observed path. A new
fictional-only turn removed “Um/Uh,” retained “Do not check Y,” took 3,070 ms,
reported that MCP disabled, and retained empty skills/tools/MCP inventories
after model completion. There were no observed tool executions or custom-agent
loads. Qualification must inspect model-startup events and post-turn state,
not infer isolation from preflight alone.

This is a qualified narrow interpretation candidate, not an OS sandbox, a
production controller, a typed orchestration plan or proof that arbitrary
provider/managed context is absent. No audio, real catalog or work request was
sent. At that qualification milestone, repository dependencies and packaging
were unchanged.

The subsequent repository adapter now uses the exact SDK dependency and
host-validates typed plans, exclusions, DAGs and Roman output. Ten focused
cases pass; an actual fictional-only X/Y/Z plan took 8,593 ms through its full
lifecycle. A separate portable candidate verifies SDK/native loading and
synthetic UI paths. The adapter is now connected in source through canonical catalog discovery,
a durable host scheduler and Plans UI; disposable fixtures verify execution
boundaries, not real multi-session work. Prepared-folder speech activation is
connected; installation, performance and human multilingual quality remain unfinished. See
[runtime contracts](../architecture/runtime-contracts.md).

## Prototype voice profiles and the required future engine

Recognition and speaking-voice settings are independent. In the .9 candidate,
Windows en-US recognition below 0.35 confidence returns editable text marked
for explicit review, never automatic dispatch or work preparation. Confidence
remains the minimum across recognized phrases; the threshold is not lowered.
Transcripts over the 1,000-character request limit are retained up to a bounded
10,000-character result, but require manual shortening. Nothing is silently
truncated or split. Empty text and invalid confidence produce distinct errors.
This recovers uncertain results; it does not qualify human recognition accuracy
or introduce another recognition language/provider.

The owner selected **installed local voices for the prototype**, but made
**arbitrary voice identity, timbre and emotional style mandatory future
requirements**, not optional polish. Those richer controls are not supplied
by Windows System.Speech and are not implemented or downloaded here.

The desktop's **Voice profiles / customize speech** panel discovers enabled
installed voices on demand, showing their gender and culture metadata.
Gender selection filters voices; it does not transform a voice's identity.
Profiles save the exact voice, requested pitch (-12 to +12 semitones), Windows
rate (-10 to +10) and volume (0-100). Pitch response is voice/engine-dependent,
not a promise of calibrated acoustic intervals. Rate is not a measured
playback-speed multiplier. Volume 0 is silent. Speaking profiles never change
the selected recognition engine/language: legacy Windows remains en-US,
whereas the connected local Whisper candidate uses automatic language detection.

Create a profile with **Duplicate profile**, edit its name/controls and
**Save & use profile**. Rename an existing profile through the same save action.
**Use saved profile** activates an unchanged saved profile; only an inactive
profile can be deleted. At most 32 named profiles are supported. Preview uses
the current draft without saving or activating it. **Stop preview** interrupts
playback, not work. Starting capture stops preview before opening the input;
voice controls are locked during microphone checks/recording/dispatch.

### Synthesis-provider boundary

`desktop/services/synthesis.cjs` separates profile persistence from provider-specific
validation, voice discovery and playback. `VoiceHost` owns the provider
registry; only `WindowsSpeechProvider` is currently registered:

- `id`, `label`, `controls`, `features`: stable provider identity, numeric
  control descriptors and explicit arbitrary-identity/timbre/emotion support.
- `validate(profile)`: reject invalid or unsupported parameters, never ignore
  them. `voiceId` is an opaque exact identity within that provider.
- `catalog(operation)`: return enabled voices and capability metadata on
  explicit discovery, honoring cancellation.
- `speak(text, profile, operation)`: play one validated, immutable profile
  snapshot; honor `operation.controller.signal`. Native adapters also track
  only their own child for bounded process-tree cleanup.

Conversation progress, replies, work completion and desktop fixture speech
all call the same host speech entry. A future adapter can replace synthesis
without changing session routing, confirmation, permissions or job execution.
The host cancels superseded speech explicitly; previews never dispatch work.
The native adapter passes structured JSON to `speech.ps1` and XML-escapes
spoken text before SSML. Its companion `speech.txt` is kept identical.
The internal render mode returns bounded in-memory PCM for non-audible native
qualification; no renderer render/file-write API is exposed.

Profiles are serialized to one atomic `voice-profiles.json` in the private
application profile, separate from session configuration. Reads are bounded
to 64 KiB. Only an absent file gets the standard default; malformed data and
missing providers produce visible errors. An explicitly selected missing voice
fails instead of silently substituting another. The default profile deliberately
uses the first enabled English voice, rate 1, pitch 0 and volume 100.
Saving/activating a profile affects later utterances, not playback already
in progress. Playback has a 180-second host bound.

Adding the required richer engine still needs its adapter, licensed original/
consented voice assets, richer parameter metadata/UI where needed, cancellation
and performance qualification. Network/audio/text handling, accounts, costs
and any model download need explicit approval. The provider seam does not
implement or authorize those features, and a fixture adapter is not an AI engine.

## 1. Common wake-word contract

Recommend a local keyword detector while explicitly enabled, even if the
conversation uses cloud speech. Open one conversation after the wake phrase,
permit follow-up turns, then return to standby on sleep/timeout.
The phrase, timeout, language coverage and activation thresholds remain open.
Standby must not stream audio to a provider. Wake detection is not authentication.

Separate keyword spotting, voice activity detection, end-of-turn detection,
speech recognition, intent interpretation, synthesis and echo control.
One library supporting several stages does not establish a working hands-free
conversation. Recognizing "stop speaking" must not imply "cancel all jobs."

## 2. Options and trade-offs

| Option | Evidence-backed candidate | Benefits | Costs and qualification risks |
|---|---|---|---|
| Local chained speech | sherpa-onnx keyword spotting, streaming ASR, VAD and TTS; whisper.cpp as an ASR comparison | Audio can stay on-device; independently replace stages; no metered speech API per turn. | Model downloads/licenses, native packaging, CPU/GPU/RAM competition, pronunciation and turn-taking need target-machine evaluation. Whisper ASR alone supplies neither TTS nor wake handling. |
| Cloud chained speech | Hosted transcription + separately generated speech, with the Agency connector remaining the task backend | Inspectable transcript/permission boundary; swap speech providers without changing session routing. | Audio/text leave the device; separate credentials, network latency, request cost and retention terms; natural timing/interruptions are application work. |
| Cloud realtime speech-to-speech | OpenAI Realtime API as one documented example | Integrated audio conversation and tool events, streaming speech and interruption support. | Hosted model/data/cost dependency; voice model must not become an unrestricted second coding agent; bridge tools need strict validation and approval. |
| Cloud voice with delegated backend | OpenAI GPT-Live client delegation as a documented example | Explicitly separates a live conversation from an application-owned existing backend. Conceptually close to Intercom. | Documentation is not an Agency connector; verify account/model availability, protocol fit, duration-based voice cost plus backend charges, privacy and interruption behavior. |

Local speech does not mean the whole system is offline: Agency/Copilot may use
hosted models and tools. Cloud speech does not automatically improve accuracy,
naturalness or latency on this machine; those are measurements, not assumptions.
A Copilot subscription does not establish entitlement to a separate speech API.

## 3. Recommended evaluation, not a provider choice

The concrete first candidate is a native sherpa-onnx worker for local keyword
spotting, streaming ASR/VAD and one compatible TTS voice. Compare whisper.cpp
only where multilingual/name accuracy warrants an ASR challenger; compare
GPT-Live client delegation for the natural full-duplex cloud experience.
See [technology decisions](../architecture/technology-decisions.md) for language/model/license
gates and [qualification](performance-and-qualification.md) for test evidence.
No exact model or voice has been selected.

Keep a provider-neutral chained boundary as the baseline. Compare it with the
delegated cloud voice route rather than claiming modular ASR/TTS will feel
identical to a native speech-to-speech conversation. Keep the local wake and
request/permission/job contracts independent of the voice provider.

Evaluate one viable local bundle and one viable cloud configuration using the
same consented or synthetic utterances, audio devices and request scenarios:

- Project/session names, technical words, dates, corrections, ambiguous targets,
  pauses mid-sentence, background sound and assistant playback.
- Required spoken languages and code-switching, once the user selects them.
- Wake false positives per hour, missed wakes, idle resource use and the
  maximum standby buffer. Never use a wake benchmark as speaker authentication.
- End-of-speech to first useful audible response, median/p95; measure a quick
  acknowledgment separately from the actual answer.
- Recognition/intent errors, spoken intelligibility and naturalness through
  human listening. Text output does not establish voice quality.
- Playback interruption, echo-induced self-wakes, device loss, offline/cloud
  outage, quota exhaustion, cleanup and long-running background job behavior.
- CPU/GPU/RAM with the 3D view and a coding agent running concurrently.
  Agree target hardware and budgets before setting numerical pass limits.
- Default speed-profile startup, standby, wake and useful-response latency
  first, then compare proposed Balanced/Accuracy settings against the same
  scenarios. Report quality regressions as well as any speed improvement.

Report setup/download size, licensing of code AND exact model/voice artifacts,
measured resources, usage accounting and a dated provider-data receipt.
Do not infer model licensing from the wrapper library. Do not download several
large models or record the user merely to prepare this paper comparison.

## 4. Privacy and cost differences

Local mode proposes volatile audio only; transcripts still need an explicit
retention decision. In cloud mode, enumerate audio, transcript, prompt and tool
result transmission separately. Send minimum result summaries, not the entire
Context Mesh/private session history. No silent fallback uploads.

OpenAI's API data-controls documentation says API data is not used for training
by default absent opt-in, but that is not zero retention. Abuse monitoring and
endpoint-specific application-state policies still apply; special retention
controls require eligibility/approval. Check the actual chosen endpoint and
account, not a generic promise.

Do not quote a dollar estimate before provider/model, region, expected active
conversation duration and usage are chosen. Local inference trades API cost
for hardware/power/maintenance; cloud voice and Copilot work are separate costs.
Keep an explicit speech budget and session timeout if cloud is selected.

### Native audio and full-duplex boundary

The proposed worker uses Windows capture/playback APIs, not PCM through React.
Microsoft's AEC reference-control interface starts at Windows build 22621 and
depends on the endpoint. `E_NOINTERFACE` means controllable render-reference
AEC is unavailable; it does not prove that no endpoint AEC exists.
Successful API calls also do not establish acoustic quality. Speakers,
Bluetooth/default-device changes, self-wake and interruption need real tests.
A labelled headset/half-duplex fallback is not full-duplex qualification.

For GPT-Live client delegation, metadata does not contain the user's complete
request. Keep bounded transcript/task state, wait for a finalized approved
intent and correlate delegation/job IDs. Spoken commentary is paraphrased:
appending it is not proof the user heard it or that a task succeeded.

## 5. Primary references

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx): documents local ASR, TTS,
  keyword spotting and VAD; Windows and native Rust/C/C++ APIs as well as other
  bindings. Supported bindings do not qualify a particular model/runtime pair.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp): documents Windows,
  CPU/GPU ASR, model resource examples and quantization; not a full voice stack.
- [Voice architectures](https://developers.openai.com/api/docs/guides/voice-agents):
  chained, realtime and delegated approaches, including evaluation dimensions.
- [Realtime API](https://developers.openai.com/api/docs/guides/realtime):
  WebRTC/WebSocket, audio interaction and trusted credential handling.
- [GPT-Live](https://developers.openai.com/api/docs/guides/live):
  client delegation and independent backend work.
- [API data controls](https://developers.openai.com/api/docs/guides/your-data):
  retention is endpoint/account-specific, not synonymous with no training.
- [Windows AEC control](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nn-audioclient-iacousticechocancellationcontrol):
  OS floor and endpoint-dependent render-reference support.
- [GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation):
  client-owned context/backend, delegation correlation and speech semantics.

No source establishes that a particular configuration works in Intercom yet.
