const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');
const { NativeRecognitionWorker } = require('./native-recognition.cjs');

const modelName = 'ggml-large-v3-turbo-q5_0.bin';
const modelHash = '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2';
const runtimeHashes = {
  'intercom-recognition.exe': '301beb02a6b303cd0344810c00d507ffdeca7536e4495c2b40772b7013f5c48b',
  'ggml-base.dll': '56a44031c84d0df6e4439401a7d4557d173f78217ea58e7ee4c8f1c4c9457d47',
  'ggml-blas.dll': '4c8154990778ff47c82712fa725bf1d7035573aed1478c997b7109f3f24e6909',
  'ggml-cpu-alderlake.dll': 'f84ac05fcbe9bbfc9cf988267d43fd55832ced67d1ee99b65ede05f236768737',
  'ggml-cpu-cannonlake.dll': '739565c14bfed71ad26cbac344cf00c3e7997a3b551b46842767344380b78ca5',
  'ggml-cpu-cascadelake.dll': '562fa3cd5045a798615561c9497e60cbfc2bb0767d9b1127d406ccee1660229d',
  'ggml-cpu-haswell.dll': '5375f097898289e2e8acc488812a474d3f3f05de0f7bdc4d9f395db306f8fb53',
  'ggml-cpu-icelake.dll': '463c0e882e6e1a8b87b86f0fc3b9a3d07be917e49343c451d6247a98dd0256dc',
  'ggml-cpu-sandybridge.dll': 'f2ecdc9c118edde360e6fc2dfc9f51fe09bc2f943e18acd764977acf3ed150ed',
  'ggml-cpu-skylakex.dll': '44d8d5afcfe679eee21efc758af9de3bcea0319a91c7c27f7204748a0965f8bf',
  'ggml-cpu-sse42.dll': 'ecf0699b5aa926bd32fdbbe3b8f7bcac6ab78796e0129f5e5bf806cdaa0c6436',
  'ggml-cpu-x64.dll': '5d46f05059b4ed1d1d3291e57f4edd9d1b987d6f352bd638703783e0fb01f1dc',
  'ggml.dll': 'd28dc70cb411a6c8a51f225ef837e1529fee17c8d7b9aa124ecaa4b84852a959',
  'libopenblas.dll': '4c7fb23e900bd637cf771ad4ae3d1b51112a897385906433f2f1e58fe053ff70',
  'whisper-cli.exe': '225aa686b74010c0259e8d28763aa89a078a0141091f525779fae6892e8e6097',
  'whisper.dll': 'fdf92de84634a7d4e97d300bb2ffe09f2e038b920fa9fbcc7c34e86587b4cf6b',
};
const vulkanHashes = {
  'intercom-recognition.exe': runtimeHashes['intercom-recognition.exe'],
  'ggml-base.dll': 'c04a76857a61b96a00ba1f3a04f8367a2888fd1d7a0742c7de5c79893266f9b3',
  'ggml-cpu.dll': '5926da0bac2d6747d9d271cf8f3f4c3bc6c1d822818c85bd7bf8f0bddae0d97f',
  'ggml-vulkan.dll': '364f5f02c1cebf208865acf486ff88f765c9a5f7ca4d6e90c60622e9a2021e63',
  'ggml.dll': '39b7eaeea3c0c32cfa6471bf2248d5b835fee184b7f217ca0964e87f737ac159',
  'whisper-cli.exe': 'c22f67649c3e3c11346a9da3f28f77a17d5594cd63133980c83699a49a110deb',
  'whisper.dll': '477386796c02976316ebc2847b588d3be77522b886035e69aa15903b3a69129d',
};

async function digest(file, signal) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}

function recognitionResult(result) {
  if (!Array.isArray(result?.transcription) || result.transcription.length > 1000 ||
      typeof result.result?.language !== 'string') throw new Error('Local recognition returned invalid structured output. Nothing was sent.');
  let text = '';
  let probability = 0;
  let count = 0;
  for (const segment of result.transcription) {
    if (typeof segment.text !== 'string' || !Array.isArray(segment.tokens) || segment.tokens.length > 10000) {
      throw new Error('Local recognition returned an invalid segment. Nothing was sent.');
    }
    text += segment.text;
    if (text.length > 50000) throw new Error('Recognition exceeded the supported transcript size. Nothing was sent.');
    for (const token of segment.tokens) {
      if (!Number.isInteger(token.id) || token.id < 0 || !Number.isFinite(token.p) || token.p < 0 || token.p > 1) {
        throw new Error('Local recognition returned invalid token probabilities. Nothing was sent.');
      }
      if (token.id < 50257) { probability += token.p; count++; }
    }
  }
  text = text.trim();
  if (!text || !count) throw new Error('No speech was recognized. Nothing was sent. Check the input meter and try again.');
  // Decoder token probabilities are not calibrated word-accuracy confidence.
  const tokenProbability = probability / count;
  return { text, confidence: null, tokenProbability, language: result.result.language,
    reviewRequired: tokenProbability < 0.5, engine: 'whisper.cpp-large-v3-turbo-q5_0' };
}

class WhisperRecognizer {
  constructor(root, backend = 'cpu', workerOptions) {
    if (backend !== 'cpu' && backend !== 'vulkan') throw new Error('Unsupported local speech backend.');
    this.root = root;
    this.backend = backend;
    this.hashes = backend === 'vulkan' ? vulkanHashes : runtimeHashes;
    this.verified = null;
    this.native = new NativeRecognitionWorker(root, backend, workerOptions);
    this.closed = false;
  }

  async verify(work) {
    const files = [[modelName, modelHash], ...Object.entries(this.hashes).map(([name, hash]) => [path.join('runtime', name), hash])];
    const stamps = await Promise.all(files.map(async ([name]) => {
      try {
        const stat = await fs.stat(path.join(this.root, name));
        if (!stat.isFile()) throw new Error('Not a file.');
        return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      } catch (error) {
        throw new Error(`Local multilingual recognition is not ready (${name}). Set up the pinned speech runtime before recording. ${error.message}`, { cause: error });
      }
    }));
    const stamp = stamps.join('|');
    const unexpected = (await fs.readdir(path.join(this.root, 'runtime'))).filter((name) =>
      /\.(dll|exe)$/i.test(name) && !Object.hasOwn(this.hashes, name));
    if (unexpected.length) throw new Error('Unrecognized local speech backend. Nothing was executed; reinstall the pinned runtime.');
    if (this.verified === stamp) return;
    for (const [name, hash] of files) {
      if (work.cancelled) throw new Error('Local recognition cancelled.');
      if (await digest(path.join(this.root, name), work.controller?.signal) !== hash) {
        throw new Error(`Local speech integrity check failed for ${name}. Nothing was sent; reinstall the pinned runtime.`);
      }
    }
    this.verified = stamp;
  }

  async ready(work) {
    if (this.closed) throw new Error('Local recognition is closed.');
    try { await this.verify(work); }
    catch (error) { await this.native.close(); throw error; }
    if (this.closed || work.cancelled) throw new Error('Local recognition cancelled.');
    const worker = await this.native.ready(work);
    return { transport: 'warm-private-pipe', backend: this.backend, warm: true, pid: worker.child.pid };
  }

  async transcribe(work, wave, _run, language = 'auto', timeout = 180000) {
    if (!['auto', 'en', 'hi'].includes(language)) throw new Error('Unsupported recognition language.');
    await this.ready(work);
    try {
      const result = await this.native.transcribe(work, wave, language, timeout);
      if (work.cancelled) throw new Error('Local recognition cancelled.');
      return recognitionResult(result);
    } catch (error) {
      await this.native.close();
      throw error;
    }
  }

  async close() {
    this.closed = true;
    await this.native.close();
  }

  // Explicit diagnostic CLI path; normal recording always uses the warm helper.
  async transcribeCLI(work, wave, run, language = 'auto', timeout = 180000) {
    if (!['auto', 'en', 'hi'].includes(language)) throw new Error('Unsupported recognition language.');
    await this.verify(work);
    if (work.cancelled) throw new Error('Local recognition cancelled.');
    const prefix = `\\\\.\\pipe\\intercom-recognition-${randomUUID()}`;
    let socket;
    let payload = '';
    let bytes = 0;
    let failure;
    let complete = false;
    let finish;
    const received = new Promise((resolve) => { finish = resolve; });
    const decoder = new StringDecoder('utf8');
    const server = net.createServer((connection) => {
      if (socket) { connection.destroy(); failure = new Error('Unexpected second recognition-output connection. Nothing was sent.'); return; }
      socket = connection;
      connection.on('data', (data) => {
        bytes += data.length;
        if (bytes > 2 * 1024 * 1024) {
          failure = new Error('Local recognition exceeded its structured-output limit. Nothing was sent.');
          connection.destroy();
          return;
        }
        payload += decoder.write(data);
      });
      connection.on('error', (error) => { failure = error; finish(); });
      connection.on('end', () => { payload += decoder.end(); complete = true; finish(); });
      connection.on('close', finish);
    });
    server.on('error', (error) => { failure = error; finish(); });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(prefix + '.json', resolve);
    });
    let timer;
    let diagnostics = '';
    let usedVulkan = false;
    try {
      // v1.9.2 writes output-file "-" to CON on Windows, bypassing stdout pipes.
      // An owned named pipe supplies the JSON file API without persisting speech.
      await run(work, path.join(this.root, 'runtime', 'whisper-cli.exe'), [
        '--model', path.join(this.root, modelName), '--file', '-', '--language', language,
        '--threads', '4', ...(this.backend === 'cpu' ? ['--no-gpu'] : ['--device', '0']),
        // --no-prints also suppresses the diagnostic required to verify GPU use.
        ...(this.backend === 'cpu' ? ['--no-prints'] : []), '--no-timestamps',
        '--beam-size', '1', '--best-of', '1', '--output-json-full', '--output-file', prefix,
      ], { input: wave, mode: 'recognize', timeout,
        onDiagnostic: (text) => {
          diagnostics = (diagnostics + text).slice(-16000);
          if (diagnostics.includes('whisper_backend_init_gpu: using Vulkan0 backend')) usedVulkan = true;
        },
        environment: { ...process.env, OPENBLAS_NUM_THREADS: '4', OMP_NUM_THREADS: '4' } });
      await Promise.race([received, new Promise((resolve) => { timer = setTimeout(resolve, 1000); })]);
      if (work.cancelled) throw new Error('Local recognition cancelled.');
      if (failure) throw failure;
      if (this.backend === 'vulkan' && !usedVulkan) {
        throw new Error('The selected Vulkan speech backend was not observed. Nothing was sent; check the GPU driver or explicitly choose the CPU engine.');
      }
      if (!complete || !payload.trim()) throw new Error('No complete structured recognition result was received. Nothing was sent.');
      let result;
      try { result = JSON.parse(payload); }
      catch (error) { throw new Error('Local recognition returned malformed JSON. Nothing was sent.', { cause: error }); }
      return recognitionResult(result);
    } finally {
      clearTimeout(timer);
      socket?.destroy();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

module.exports = { WhisperRecognizer, recognitionResult, digest, modelName, modelHash, runtimeHashes, vulkanHashes };
