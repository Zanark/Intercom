const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const path = require('node:path');
const { mkdtemp, mkdir, writeFile, stat, rm } = require('node:fs/promises');
const { WhisperRecognizer, recognitionResult, modelName, runtimeHashes } = require('../../desktop/services/recognition.cjs');
const { NativeRecognitionWorker } = require('../../desktop/services/native-recognition.cjs');

function result(text = 'Refresh X. Do not check Y.', p = 0.9) {
  return { result: { language: 'en' }, transcription: [{ text, tokens: [{ id: 100, p }] }] };
}

async function writeOutput(args, bytes) {
  const prefix = args[args.indexOf('--output-file') + 1];
  await new Promise((resolve, reject) => {
    const connection = net.connect(prefix + '.json', () => {
      for (let i = 0; i < bytes.length; i++) connection.write(bytes.subarray(i, i + 1));
      connection.end();
    });
    connection.once('error', reject);
    connection.once('close', resolve);
  });
}

test('preserves exclusions and exposes uncertainty without claiming calibrated accuracy', () => {
  assert.deepEqual(recognitionResult(result()), {
    text: 'Refresh X. Do not check Y.', confidence: null, tokenProbability: 0.9,
    language: 'en', reviewRequired: false, engine: 'whisper.cpp-large-v3-turbo-q5_0',
  });
  assert.equal(recognitionResult(result('Do not check Y.', 0.49)).reviewRequired, true);
  assert.equal(recognitionResult(result('x'.repeat(50000))).text.length, 50000);
  assert.throws(() => recognitionResult(result('x'.repeat(50001))), /transcript size/);
});

test('rejects empty or malformed speech output rather than manufacturing a successful transcript', () => {
  for (const invalid of [null, {}, { transcription: [] }, result(' '), result('X', NaN), result('X', 1.1)]) {
    assert.throws(() => recognitionResult(invalid), /invalid|No speech/);
  }
  const noWords = result();
  noWords.transcription[0].tokens[0].id = 50257;
  assert.throws(() => recognitionResult(noWords), /No speech/);
  const negativeToken = result();
  negativeToken.transcription[0].tokens[0].id = -1;
  assert.throws(() => recognitionResult(negativeToken), /invalid token/);
});

test('receives disk-free structured output with split multibyte UTF-8', async () => {
  const recognizer = new WhisperRecognizer('unused-unit-fixture');
  recognizer.verify = async () => {};
  const text = 'Check caf\u00e9. Do not check Y.';
  const wave = Buffer.from('synthetic-unit-fixture');
  const work = { cancelled: false };
  const output = await recognizer.transcribeCLI(work, wave, async (operation, executable, args, options) => {
    assert.equal(operation, work);
    assert.equal(options.input, wave);
    assert.equal(options.timeout, 900000);
    assert.ok(executable.endsWith('whisper-cli.exe'));
    await writeOutput(args, Buffer.from(JSON.stringify(result(text))));
  }, 'auto', 900000);

  assert.equal(output.text, text);
});

test('only supported explicit language hints reach native argument arrays without enabling translation', async () => {
  const recognizer = new WhisperRecognizer('unused-unit-fixture');
  recognizer.verify = async () => {};
  for (const language of ['auto', 'en', 'hi']) {
    await recognizer.transcribeCLI({}, Buffer.alloc(0), async (_, __, args) => {
      assert.equal(args[args.indexOf('--language') + 1], language);
      assert.equal(args.includes('--translate'), false);
      await writeOutput(args, Buffer.from(JSON.stringify(result())));
    }, language);
  }
  await assert.rejects(recognizer.transcribeCLI({}, Buffer.alloc(0), () => assert.fail('Invalid language started a process.'), '--translate'), /Unsupported recognition language/);
});

test('malformed structured output and native failure never become success', async () => {
  const recognizer = new WhisperRecognizer('unused-unit-fixture');
  recognizer.verify = async () => {};
  await assert.rejects(recognizer.transcribeCLI({}, Buffer.alloc(0), async (_, __, args) => {
    await writeOutput(args, Buffer.from('{incomplete'));
  }), /malformed JSON/);
  await assert.rejects(recognizer.transcribeCLI({}, Buffer.alloc(0), async () => {
    throw new Error('Owned native process cancelled.');
  }), /process cancelled/);
});

test('GPU recognition requires observed Vulkan use and never silently accepts a CPU fallback', async () => {
  const recognizer = new WhisperRecognizer('unused-unit-fixture', 'vulkan');
  recognizer.verify = async () => {};
  const run = async (_, __, args, options) => {
    assert.equal(args.includes('--no-gpu'), false);
    assert.equal(args.includes('--no-prints'), false);
    assert.equal(args[args.indexOf('--device') + 1], '0');
    assert.ok(options.onDiagnostic);
    await writeOutput(args, Buffer.from(JSON.stringify(result())));
  };
  await assert.rejects(recognizer.transcribeCLI({}, Buffer.alloc(0), run), /Vulkan speech backend was not observed/);
  const output = await recognizer.transcribeCLI({}, Buffer.alloc(0), async (...args) => {
    args[3].onDiagnostic('whisper_backend_init_gpu: using Vul');
    args[3].onDiagnostic('kan0 backend\n');
    await run(...args);
  });
  assert.equal(output.text, result().transcription[0].text);
});

test('a cancelled operation cannot start native recognition', async () => {
  const recognizer = new WhisperRecognizer('unused-unit-fixture');
  recognizer.verify = async () => {};
  await assert.rejects(recognizer.transcribe({ cancelled: true }, Buffer.alloc(0), () => {
    assert.fail('A cancelled operation started a process.');
  }), /cancelled/);
});

test('empty output and cancellation after native completion cannot become a transcript', async () => {
  const recognizer = new WhisperRecognizer('unused-unit-fixture');
  recognizer.verify = async () => {};
  await assert.rejects(recognizer.transcribeCLI({}, Buffer.alloc(0), async (_, __, args) => {
    await writeOutput(args, Buffer.alloc(0));
  }), /No complete/);
  const work = { cancelled: false };
  await assert.rejects(recognizer.transcribeCLI(work, Buffer.alloc(0), async (_, __, args) => {
    await writeOutput(args, Buffer.from(JSON.stringify(result())));
    work.cancelled = true;
  }), /cancelled/);
});

test('corrupt downloaded artifacts fail integrity verification before any native execution', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.recognition-corruption-'));
  try {
    await mkdir(path.join(root, 'runtime'));
    await Promise.all([modelName, ...Object.keys(runtimeHashes).map((name) => path.join('runtime', name))]
      .map((name) => writeFile(path.join(root, name), 'corrupt synthetic artifact')));
    const recognizer = new WhisperRecognizer(root);
    await assert.rejects(recognizer.transcribe({}, Buffer.alloc(0), () => {
      assert.fail('Corrupt artifacts were executed.');
    }), /integrity check failed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a newly added backend is rejected even when expected artifacts match the verification cache', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.recognition-backend-'));
  try {
    await mkdir(path.join(root, 'runtime'));
    const files = [modelName, ...Object.keys(runtimeHashes).map((name) => path.join('runtime', name))];
    await Promise.all(files.map((name) => writeFile(path.join(root, name), 'synthetic cached artifact')));
    const recognizer = new WhisperRecognizer(root);
    // Seed the cache without including real native binaries in the unit fixture.
    recognizer.verified = (await Promise.all(files.map(async (name) => {
      const value = await stat(path.join(root, name));
      return `${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
    }))).join('|');
    await recognizer.verify({});
    await writeFile(path.join(root, 'runtime', 'ggml-unexpected.dll'), 'unrecognized backend');
    await assert.rejects(recognizer.transcribe({}, Buffer.alloc(0), () => {
      assert.fail('An unexpected backend reached native execution.');
    }), /Unrecognized local speech backend/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an additional unpinned native dependency is rejected before recognition', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.recognition-dll-'));
  try {
    await mkdir(path.join(root, 'runtime'));
    await Promise.all([modelName, ...Object.keys(runtimeHashes).map((name) => path.join('runtime', name))]
      .map((name) => writeFile(path.join(root, name), 'synthetic artifact')));
    await writeFile(path.join(root, 'runtime', 'unrecognized.dll'), 'synthetic extra dependency');
    await assert.rejects(new WhisperRecognizer(root).verify({}), /Unrecognized local speech backend/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fakeRuntime({ autoReady = true, autoResult = true, stopDelay = 0, backend = 'cpu' } = {}) {
  const children = [];
  const requests = [];
  const spawnWorker = (exe, args, options) => {
    assert.ok(exe.endsWith('intercom-recognition.exe'));
    assert.equal(args[2], String(process.pid));
    assert.equal(options.env.GGML_BACKEND_PATH, undefined);
    assert.equal(options.shell, false);
    const child = new EventEmitter();
    child.pid = 100 + children.length;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let header;
    child.stdin = new Writable({ write(bytes, _encoding, done) {
      if (!header) {
        assert.equal(bytes.toString('ascii', 0, 4), 'ICR1');
        header = Buffer.from(bytes);
      } else {
        const request = { id: header.readUInt32LE(4), language: header.readUInt32LE(8), bytes: bytes.length };
        assert.equal(header.readUInt32LE(12), bytes.length);
        requests.push(request);
        header = null;
        if (autoResult) queueMicrotask(() => child.stdout.write(JSON.stringify({ id: request.id, ...result('Check caf\u00e9. Do not check Y.') }) + '\n'));
      }
      done();
    } });
    child.kills = 0;
    child.kill = () => {
      child.kills++;
      setTimeout(() => child.emit('close', null), stopDelay);
      return true;
    };
    children.push(child);
    if (autoReady) queueMicrotask(() => child.stdout.write(JSON.stringify({ type: 'ready', protocol: 1, backend }) + '\n'));
    return child;
  };
  const worker = new NativeRecognitionWorker('unit-fixture', backend, { spawnWorker, startupTimeout: 100, stopTimeout: 100 });
  return { worker, children, requests };
}
const operation = () => ({ cancelled: false, controller: new AbortController() });

test('warm readiness and repeated language-specific requests reuse exactly one owned native process', async () => {
  const { worker, children, requests } = fakeRuntime();
  try {
    const first = await worker.ready(operation());
    for (const language of ['auto', 'hi', 'en']) {
      const answer = await worker.transcribe(operation(), Buffer.alloc(9600044), language, 900000);
      assert.equal(recognitionResult(answer).text, 'Check caf\u00e9. Do not check Y.');
      assert.equal(worker.worker, first);
    }
    assert.equal(children.length, 1);
    assert.deepEqual(requests.map((request) => request.language), [0, 2, 1]);
    assert.ok(requests.every((request) => request.bytes === 9600044), 'A full 300-second 16 kHz WAV reaches the native transport intact.');
  } finally { await worker.close(); }
  assert.equal(children[0].kills, 1);
  assert.equal(worker.worker, null);
});

test('cancellation waits for the exact worker to exit, rejects late output, then permits a fresh worker', async () => {
  const { worker, children } = fakeRuntime({ autoResult: false, stopDelay: 10 });
  const work = operation();
  await worker.ready(work);
  const request = worker.transcribe(work, Buffer.alloc(46), 'en', 1000);
  const rejected = assert.rejects(request, /cancelled/);
  await new Promise((resolve) => setImmediate(resolve));
  work.cancelled = true;
  work.controller.abort();
  children[0].stdout.write(JSON.stringify({ id: 2, ...result('Late stale result') }) + '\n');
  await work.recognitionStop();
  await rejected;
  assert.equal(children[0].kills, 1);
  const next = await worker.ready(operation());
  assert.equal(children.length, 2);
  assert.equal(next.child, children[1]);
  children[0].stdout.write('{"type":"ready","protocol":1,"backend":"cpu"}\n');
  assert.equal(worker.worker, next);
  await worker.close();
});

test('startup cancellation, timeout, invalid backend, stale responses and output bounds clean up owned workers', async () => {
  for (const failure of ['cancel', 'timeout', 'backend', 'stale', 'oversized', 'malformed', 'exit']) {
    const { worker, children } = fakeRuntime({ autoReady: false });
    const work = operation();
    const starting = worker.ready(work);
    const rejected = assert.rejects(starting, /cancelled|timed out|backend|stale|limit|JSON|exited/);
    if (failure === 'cancel') { work.cancelled = true; work.controller.abort(); }
    if (failure === 'backend') children[0].stdout.write('{"type":"ready","protocol":1,"backend":"vulkan"}\n');
    if (failure === 'stale') children[0].stdout.write('{"id":999}\n');
    if (failure === 'oversized') children[0].stdout.write(Buffer.alloc(2 * 1024 * 1024 + 2, 32));
    if (failure === 'malformed') children[0].stdout.write('{bad\n');
    if (failure === 'exit') children[0].emit('close', 2);
    await rejected;
    assert.equal(worker.worker, null, failure);
    assert.equal(children[0].kills, failure === 'exit' ? 0 : 1, failure);
    await worker.close();
  }
});

test('request IDs reject a late/mismatching response rather than attributing it to a new draft', async () => {
  const { worker, children } = fakeRuntime({ autoResult: false });
  await worker.ready(operation());
  const response = worker.transcribe(operation(), Buffer.alloc(46), 'hi', 100);
  const rejected = assert.rejects(response, /stale/);
  await new Promise((resolve) => setImmediate(resolve));
  children[0].stdout.write(JSON.stringify({ id: 999, ...result() }) + '\n');
  await rejected;
  assert.equal(children[0].kills, 1);
  assert.equal(worker.worker, null);
});

test('an unexpected idle-worker exit is surfaced once before an explicit retry can load a replacement', async () => {
  const { worker, children } = fakeRuntime();
  await worker.ready(operation());
  children[0].emit('close', 2);
  await assert.rejects(worker.ready(operation()), /worker exited/);
  assert.equal(children.length, 1, 'The failed call must not silently restart native recognition.');
  await worker.ready(operation());
  assert.equal(children.length, 2);
  await worker.close();
});

test('native diagnostics distinguish expected shutdown from unexpected idle exits without recording payloads', async () => {
  const { worker, children } = fakeRuntime();
  const events = [];
  worker.diagnostics = { record: (event, fields, error) => events.push({ event, fields, failed: !!error }) };
  await worker.ready(operation());
  await worker.close();
  assert.deepEqual(events.map((item) => item.event), ['process.start', 'process.exit']);
  assert.equal(events[1].failed, false);
  await worker.ready(operation());
  children[1].stderr.write('Private worker output must not become persistent fields.');
  children[1].emit('close', 0);
  assert.equal(events.at(-1).event, 'process.failure');
  assert.equal(events.at(-1).failed, true);
  assert.ok(!JSON.stringify(events).includes('Private worker output'));
  await assert.rejects(worker.ready(operation()), /worker exited/);
  await worker.close();
});

test('a stuck cancellation is bounded and blocks new requests until that exact process exits', async () => {
  const { worker, children } = fakeRuntime({ autoResult: false });
  worker.stopTimeout = 10;
  await worker.ready(operation());
  children[0].kill = () => { children[0].kills++; return false; };
  const response = worker.transcribe(operation(), Buffer.alloc(46), 'en', 10);
  await assert.rejects(response, /did not stop/);
  await assert.rejects(worker.ready(operation()), /stopping/);
  assert.equal(children.length, 1);
  assert.equal(children[0].kills, 1);
  children[0].emit('close', null);
  await worker.ready(operation());
  assert.equal(children.length, 2);
  await worker.close();
});

test('warm request timeout and private-pipe failure both retire the worker without replay', async () => {
  for (const pipeFailure of [false, true]) {
    const { worker, children } = fakeRuntime({ autoResult: false });
    await worker.ready(operation());
    const response = worker.transcribe(operation(), Buffer.alloc(46), 'auto', 20);
    const rejected = assert.rejects(response, /timed out|pipe failed/);
    if (pipeFailure) {
      await new Promise((resolve) => setImmediate(resolve));
      children[0].stdin.emit('error', new Error('synthetic pipe failure'));
    }
    await rejected;
    assert.equal(children.length, 1);
    assert.equal(children[0].kills, 1);
    assert.equal(worker.worker, null);
  }
});

test('integrity failure retires an already warm worker before any further recognition', async () => {
  const recognizer = new WhisperRecognizer('fixture');
  let closed = 0;
  recognizer.native.close = async () => { closed++; };
  recognizer.verify = async () => { throw new Error('Local speech integrity check failed'); };
  await assert.rejects(recognizer.ready(operation()), /integrity/);
  assert.equal(closed, 1);
});

test('metadata changes reverify pinned content without needlessly unloading the model, and closure prevents restart', async () => {
  const recognizer = new WhisperRecognizer('fixture');
  let stamp = 'first';
  let starts = 0;
  let stops = 0;
  recognizer.verify = async () => { recognizer.verified = stamp; };
  recognizer.native.ready = async () => { starts++; return { child: { pid: 123 } }; };
  recognizer.native.close = async () => { stops++; };
  await recognizer.ready(operation());
  await recognizer.ready(operation());
  assert.equal(stops, 0);
  stamp = 'replacement';
  await recognizer.ready(operation());
  assert.equal(recognizer.verified, 'replacement');
  assert.equal(stops, 0, 'Successful re-verification proves the same pinned content; metadata-only changes must not cause cold drafts.');
  assert.equal(starts, 3);
  await recognizer.close();
  await assert.rejects(recognizer.ready(operation()), /closed/);
  assert.equal(stops, 1);
});
