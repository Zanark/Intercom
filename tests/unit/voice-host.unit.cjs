const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtemp, mkdir, rm, writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');
const { VoiceHost, resultReader, waveBytes, eligibleSession } = require('../../desktop/services/voice.cjs');
const { VoiceProfiles, WindowsSpeechProvider } = require('../../desktop/services/synthesis.cjs');

const id = '11111111-1111-4111-8111-111111111111';
function wave(pcm = Buffer.alloc(16000), rate = 16000) {
  const buffer = Buffer.alloc(44 + pcm.length);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(pcm.length, 40); pcm.copy(buffer, 44);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);
}
test('requires a matching successful terminal response, not an idle event or exit alone', () => {
  const reader = resultReader(id);
  reader.accept({ type: 'assistant.idle', data: {} });
  assert.throws(() => reader.finish(), /No matching/);
  reader.accept({ type: 'session.task_complete', data: { success: true, summary: 'Hello world.' } });
  reader.accept({ type: 'result', sessionId: '22222222-2222-4222-8222-222222222222', exitCode: 0 });
  assert.throws(() => reader.finish(), /No matching/);
  reader.accept({ type: 'result', sessionId: id, exitCode: 1 });
  assert.throws(() => reader.finish(), /No matching/);
  reader.accept({ type: 'result', sessionId: id, exitCode: 0 });
  assert.equal(reader.finish(), 'Hello world.');
});
test('rejects unexpected work tools and unsuccessful completion', () => {
  const reader = resultReader(id);
  assert.throws(() => reader.accept({ type: 'tool.execution_start', data: { toolName: 'powershell' } }), /outside conversation-only/);
  reader.accept({ type: 'session.task_complete', data: { success: false, summary: 'Not completed' } });
  reader.accept({ type: 'result', sessionId: id, exitCode: 0 });
  assert.throws(() => reader.finish(), /No matching/);
});
test('accepts a plain conversation reply only with a matching successful terminal result', () => {
  const reader = resultReader(id);
  reader.accept({ type: 'assistant.message', data: { content: 'Hello world.' } });
  reader.accept({ type: 'assistant.idle', data: {} });
  assert.throws(() => reader.finish(), /No matching/);
  reader.accept({ type: 'result', sessionId: '22222222-2222-4222-8222-222222222222', exitCode: 0 });
  assert.throws(() => reader.finish(), /No matching/);
  reader.accept({ type: 'result', sessionId: id, exitCode: 1 });
  assert.throws(() => reader.finish(), /No matching/);
  reader.accept({ type: 'result', sessionId: id, exitCode: 0 });
  assert.equal(reader.finish(), 'Hello world.');
});
test('an explicit failed task cannot become success through a later conversation reply', () => {
  const reader = resultReader(id);
  reader.accept({ type: 'assistant.message', data: { content: 'I could not complete that.' } });
  reader.accept({ type: 'session.task_complete', data: { success: false, summary: 'Not completed.' } });
  reader.accept({ type: 'assistant.message', data: { content: 'Hello world.' } });
  reader.accept({ type: 'result', sessionId: id, exitCode: 0 });
  assert.throws(() => reader.finish(), /No matching/);
});
test('never substitutes missing, browse-only or in-use sessions', () => {
  const row = { session_id: id, can_resume: true, source: 'copilot_cli', status: 'idle', folder: process.cwd() };
  assert.equal(eligibleSession({ sessions: [row] }, id), row);
  assert.throws(() => eligibleSession({ sessions: [] }, id), /not found/);
  assert.throws(() => eligibleSession({ sessions: [{ ...row, can_resume: false }] }, id), /cannot be resumed/);
  assert.throws(() => eligibleSession({ sessions: [{ ...row, status: 'in_use' }] }, id), /in use/);
});
test('bounds and validates canonical PCM audio before starting recognition', () => {
  assert.equal(waveBytes(wave()).length, 16044);
  assert.throws(() => waveBytes(new ArrayBuffer(45)), /Invalid/);
  const stereo = wave(); new DataView(stereo).setUint16(22, 2, true);
  assert.throws(() => waveBytes(stereo), /mono/);
  assert.throws(() => waveBytes(wave(Buffer.alloc(16000 * 2 * 301))), /five-minute/);
});
test('accepts the exact five-minute boundary and rejects one additional PCM sample at representative supported rates', () => {
  for (const rate of [8000, 16000, 44100, 48000]) {
    assert.equal(waveBytes(wave(Buffer.alloc(rate * 2 * 300), rate)).length, 44 + rate * 2 * 300);
    assert.throws(() => waveBytes(wave(Buffer.alloc(rate * 2 * 300 + 2), rate)), /five-minute|oversized/);
  }
});
test('long audio extends recognition deadlines without weakening short-recording deadlines or request limits', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  const timeouts = [];
  host.recognitionSettings = async () => ({ engine: 'whisper', language: 'en' });
  host.localRecognizer = () => ({
    transcribe: async (_work, input, _run, language, timeout) => {
      assert.equal(language, 'en');
      timeouts.push(timeout);
      return { text: `${input.length} bytes`, reviewRequired: false };
    },
  });
  await host.transcribe(id, wave());
  await host.transcribe(id, wave(Buffer.alloc(16000 * 2 * 300)));
  assert.deepEqual(timeouts, [180000, 900000]);
  host.recognitionSettings = async () => ({ engine: 'windows' });
  host.process = async (_work, _executable, _args, options) => {
    timeouts.push(options.timeout);
    return JSON.stringify({ text: 'Complete local transcript.', confidence: 0.9 });
  };
  await host.transcribe(id, wave());
  await host.transcribe(id, wave(Buffer.alloc(16000 * 2 * 300)));
  assert.deepEqual(timeouts.slice(2), [45000, 905000]);
  assert.throws(() => host.send(id, 'x'.repeat(1001)), /1-1000/);
});
test('recognition preserves uncertain text for review without relaxing automatic-send confidence', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  host.recognitionSettings = async () => ({ engine: 'windows' });
  for (const confidence of [0, 0.349, 0.35, 0.9]) {
    host.process = async () => JSON.stringify({ text: '  Review this recognized request.  ', confidence });
    assert.deepEqual(await host.transcribe(id, wave()), {
      text: 'Review this recognized request.', confidence, reviewRequired: confidence < 0.35,
    });
  }
});
test('recognition retains long clear transcripts so the destination can enforce its own request limit', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  host.recognitionSettings = async () => ({ engine: 'windows' });
  const text = 'x'.repeat(50000);
  host.process = async () => JSON.stringify({ text, confidence: 0.9 });
  assert.deepEqual(await host.transcribe(id, wave()), { text, confidence: 0.9, reviewRequired: false });
  host.process = async () => JSON.stringify({ text: 'x'.repeat(50001), confidence: 0.9 });
  await assert.rejects(host.transcribe(id, wave()), /supported transcript size/);
});
test('recognition distinguishes missing speech and invalid confidence from reviewable uncertainty', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  host.recognitionSettings = async () => ({ engine: 'windows' });
  for (const result of [null, { text: ' ', confidence: 0.9 }]) {
    host.process = async () => JSON.stringify(result);
    await assert.rejects(host.transcribe(id, wave()), /No English \(US\) speech/);
  }
  for (const confidence of [null, -0.1, 1.1, '0.9']) {
    host.process = async () => JSON.stringify({ text: 'A request.', confidence });
    await assert.rejects(host.transcribe(id, wave()), /invalid confidence/);
  }
  assert.equal(host.work, null);
});
test('source profiles without a bundled engine require setup and never silently start Windows recognition', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.intercom-speech-setup-'));
  try {
    const host = new VoiceHost(root, () => {});
    host.process = async () => assert.fail('An unconfigured engine was executed.');
    assert.equal((await host.recognitionSettings()).engine, 'whisper');
    await assert.rejects(host.recognitionReady(id), /before recording/);
    await assert.rejects(host.transcribe(id, wave()), /before recording/);
    assert.equal(host.work, null);
    await host.configureRecognition(id, 'windows', () => assert.fail('Legacy selection must not open a directory picker.'));
    await host.recognitionReady(id);
    const restarted = new VoiceHost(root, () => {});
    assert.equal((await restarted.recognitionSettings()).engine, 'windows');
    assert.throws(() => restarted.configureRecognition(id, 'unknown'), /Unsupported/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('bundled recognition is automatic and language preferences survive portable resource relocation', async () => {
  const profile = await mkdtemp(path.join(process.cwd(), '.intercom-bundled-default-'));
  try {
    const bundledRoot = path.join(profile, 'extraction-one', 'speech');
    const host = new VoiceHost(profile, () => {}, { bundledRoot });
    assert.deepEqual(await host.recognitionSettings(), {
      version: 1, engine: 'whisper', backend: 'vulkan', language: 'auto', source: 'bundled', root: bundledRoot, ready: true,
    });
    await assert.rejects(readFile(path.join(profile, 'recognition-settings.json')), { code: 'ENOENT' });
    await host.setRecognitionLanguage(id, 'hi');
    assert.deepEqual(JSON.parse(await readFile(path.join(profile, 'recognition-settings.json'), 'utf8')), {
      version: 1, engine: 'whisper', source: 'bundled', backend: 'vulkan', language: 'hi',
    });
    const relocated = path.join(profile, 'extraction-two', 'speech');
    const restarted = new VoiceHost(profile, () => {}, { bundledRoot: relocated });
    const settings = await restarted.recognitionSettings();
    assert.equal(settings.root, relocated);
    assert.equal(settings.language, 'hi');
    restarted.process = async () => assert.fail('Missing bundled resources must not execute a fallback.');
    await assert.rejects(restarted.recognitionReady(id), /not ready/);
    await assert.rejects(new VoiceHost(profile, () => {}).recognitionSettings(), /Bundled local speech is unavailable/);
  } finally { await rm(profile, { recursive: true, force: true }); }
});
test('bundling preserves explicit custom and legacy choices and refuses corrupt settings without substitution', async () => {
  const profile = await mkdtemp(path.join(process.cwd(), '.intercom-bundled-choice-'));
  try {
    const host = new VoiceHost(profile, () => {}, { bundledRoot: path.join(profile, 'included') });
    const saved = path.join(profile, 'recognition-settings.json');
    await host.configureRecognition(id, 'windows');
    assert.equal((await host.recognitionSettings()).engine, 'windows');
    const custom = { version: 1, engine: 'whisper', backend: 'cpu', root: path.join(profile, 'custom') };
    await writeFile(saved, JSON.stringify(custom));
    assert.deepEqual(await host.recognitionSettings(), { ...custom, language: 'auto', ready: true });
    await writeFile(saved, JSON.stringify({ ...custom, root: 'relative' }));
    await assert.rejects(host.recognitionReady(id), /Invalid speech recognition settings/);
    assert.equal(JSON.parse(await readFile(saved, 'utf8')).root, 'relative');
  } finally { await rm(profile, { recursive: true, force: true }); }
});
test('bundled preflight retains cancellation and never creates settings or starts a fallback', async () => {
  const profile = await mkdtemp(path.join(process.cwd(), '.intercom-bundled-cancel-'));
  try {
    const host = new VoiceHost(profile, () => {}, { bundledRoot: path.join(profile, 'included') });
    host.process = async () => assert.fail('A fallback must not execute.');
    host.localRecognizer = (settings) => ({
      ready: async (work) => {
        assert.equal(settings.source, 'bundled');
        await host.cancel(id);
        assert.equal(work.cancelled, true);
      },
    });
    await assert.rejects(host.recognitionReady(id), /cancelled/);
    await assert.rejects(readFile(path.join(profile, 'recognition-settings.json')), { code: 'ENOENT' });
    assert.equal(host.work, null);
  } finally { await rm(profile, { recursive: true, force: true }); }
});
test('recording preflight loads reusable native state and returns only observed readiness', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  const status = { transport: 'warm-private-pipe', backend: 'vulkan', warm: true, pid: 123 };
  host.recognitionSettings = async () => ({ engine: 'whisper', root: 'fixture', backend: 'vulkan' });
  let preflights = 0;
  host.localRecognizer = async () => ({ ready: async (work) => {
    assert.equal(work.cancelled, false);
    preflights++;
    return status;
  } });
  assert.deepEqual(await host.recognitionReady(id), status);
  assert.equal(preflights, 1);
});
test('voice cancellation awaits the owned warm worker without stopping an unrelated operation', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  let stopped = 0;
  const work = { id, child: null, cancelled: false, controller: new AbortController(),
    recognitionStop: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); stopped++; } };
  host.work = work;
  await host.cancel('22222222-2222-4222-8222-222222222222');
  assert.equal(stopped, 0);
  await host.cancel(id);
  assert.equal(stopped, 1);
  assert.equal(work.controller.signal.aborted, true);
});
test('app shutdown closes an idle warm recognizer and changing engines retires it', async () => {
  const profile = await mkdtemp(path.join(process.cwd(), '.intercom-warm-lifecycle-'));
  try {
    const host = new VoiceHost(profile, () => {});
    let closed = 0;
    host.recognizer = { root: 'fixture', backend: 'cpu', close: async () => { closed++; } };
    await host.configureRecognition(id, 'windows');
    assert.equal(closed, 1);
    assert.equal(host.recognizer, null);
    host.recognizer = { close: async () => { closed++; } };
    await host.close();
    assert.equal(closed, 2);
  } finally { await rm(profile, { recursive: true, force: true }); }
});
test('corrupt local setup, malformed saved settings and cancelled setup never fall back or overwrite a working choice', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.intercom-speech-setup-failure-'));
  try {
    const host = new VoiceHost(root, () => {});
    await host.configureRecognition(id, 'windows');
    const before = await readFile(path.join(root, 'recognition-settings.json'), 'utf8');
    const candidate = path.join(root, 'candidate');
    await mkdir(path.join(candidate, 'runtime'), { recursive: true });
    await assert.rejects(host.configureRecognition(id, 'whisper', async () => candidate), /not ready/);
    assert.equal(await readFile(path.join(root, 'recognition-settings.json'), 'utf8'), before);
    await assert.rejects(host.configureRecognition(id, 'whisper', async () => {
      await host.cancel(id);
      return null;
    }), /cancelled/);
    assert.equal(await readFile(path.join(root, 'recognition-settings.json'), 'utf8'), before);
    await writeFile(path.join(root, 'recognition-settings.json'), '{"version":1,"engine":"whisper","backend":"cpu","root":"relative"}');
    host.process = async () => assert.fail('Malformed settings reached native execution.');
    await assert.rejects(host.transcribe(id, wave()), /Invalid speech recognition settings/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('configured multilingual recognition receives validated audio, request cancellation and nullable confidence', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  host.recognitionSettings = async () => ({ engine: 'whisper', root: 'synthetic-root', backend: 'cpu', language: 'hi' });
  let operation;
  const expected = { text: 'Refresh X. Do not check Y.', confidence: null, tokenProbability: 0.9, reviewRequired: false };
  host.localRecognizer = () => ({
    transcribe: async (work, input, _run, language) => {
      assert.equal(language, 'hi');
      operation = work;
      assert.equal(input.readUInt32LE(24), 16000);
      assert.equal(work.id, id);
      return expected;
    },
  });
  host.process = async () => assert.fail('The legacy speech engine was invoked.');
  assert.deepEqual(await host.transcribe(id, wave()), expected);
  assert.equal(operation.controller.signal.aborted, false);
  assert.equal(host.work, null);
  assert.throws(() => host.transcribe(id, new ArrayBuffer(45)), /Invalid/);
});
test('recognition language persists across restart, defaults old settings to auto and rejects unsupported or legacy choices', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.intercom-language-'));
  try {
    const host = new VoiceHost(root, () => {});
    await assert.rejects(host.setRecognitionLanguage(id, 'en'), /Choose a local Whisper engine/);
    await host.configureRecognition(id, 'windows');
    await assert.rejects(host.setRecognitionLanguage(id, 'hi'), /Choose a local Whisper engine/);
    await writeFile(path.join(root, 'recognition-settings.json'), JSON.stringify({ version: 1, engine: 'whisper', backend: 'vulkan', root }));
    assert.equal((await host.recognitionSettings()).language, 'auto');
    for (const language of ['en', 'hi', 'auto']) {
      await host.setRecognitionLanguage(id, language);
      assert.equal((await new VoiceHost(root, () => {}).recognitionSettings()).language, language);
    }
    const before = await readFile(path.join(root, 'recognition-settings.json'), 'utf8');
    assert.throws(() => host.setRecognitionLanguage(id, '--translate'), /Unsupported/);
    assert.equal(await readFile(path.join(root, 'recognition-settings.json'), 'utf8'), before);
    await writeFile(path.join(root, 'recognition-settings.json'), before.replace('"auto"', '"fr"'));
    await assert.rejects(host.recognitionReady(id), /Invalid speech recognition settings/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('low-resolution Whisper audio requires review even with a high token probability', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  host.recognitionSettings = async () => ({ engine: 'whisper', root: 'synthetic-root', backend: 'cpu' });
  const recognized = { text: 'Do not check why.', confidence: null, tokenProbability: 0.852, reviewRequired: false };
  host.localRecognizer = () => ({ transcribe: async () => recognized });
  const input = wave();
  const view = new DataView(input);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
  const result = await host.transcribe(id, input);
  assert.equal(result.text, recognized.text);
  assert.equal(result.reviewRequired, true);
  assert.match(result.warning, /below 16 kHz/);
  assert.equal(result.tokenProbability, 0.852);
  assert.deepEqual(await host.transcribe(id, wave()), recognized);
});
test('duplicate host work is rejected and cancellation does not affect a different request', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  let release;
  const pending = host.exclusive(id, () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(host.exclusive(id, async () => {}), /still running/);
  await host.cancel('22222222-2222-4222-8222-222222222222');
  assert.equal(host.work.cancelled, false);
  await host.cancel(id);
  assert.equal(host.work.cancelled, true);
  assert.equal(host.work.controller.signal.aborted, true);
  release();
  await pending;
  assert.equal(host.work, null);
});
test('native execution can use an explicit environment instead of inheriting the parent', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  const previous = process.env.INTERCOM_TEST_PARENT;
  process.env.INTERCOM_TEST_PARENT = 'synthetic-parent-value';
  try {
    const output = await host.exclusive(id, (work) => host.process(work, process.execPath, [
      '-e', "console.log(JSON.stringify({ value: process.env.INTERCOM_TEST_CHILD, hasParent: process.env.INTERCOM_TEST_PARENT !== undefined }))",
    ], { environment: { INTERCOM_TEST_CHILD: 'bounded' } }));
    assert.deepEqual(JSON.parse(output), { value: 'bounded', hasParent: false });
  } finally {
    if (previous === undefined) delete process.env.INTERCOM_TEST_PARENT;
    else process.env.INTERCOM_TEST_PARENT = previous;
  }
});
test('cancellation stops only the host-owned native child and releases the work slot', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  const running = host.exclusive(id, (work) => host.process(work, 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30']));
  const rejected = assert.rejects(running, /Cancelled/);
  const pid = host.work.child.pid;
  assert.ok(pid > 0);
  await host.cancel(id);
  await rejected;
  assert.equal(host.work, null);
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
});
test('installed Windows recognition transcribes synthetic English audio without using a microphone', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const profile = await mkdtemp(path.join(process.cwd(), '.intercom-speech-'));
  try {
    const script = "$ProgressPreference='SilentlyContinue'; Add-Type -AssemblyName System.Speech; $s=[System.Speech.Synthesis.SpeechSynthesizer]::new(); $f=[System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono); $m=[System.IO.MemoryStream]::new(); $s.SetOutputToAudioStream($m,$f); $s.Speak('Hello world. Please say hello world.'); $s.Dispose(); [Console]::OpenStandardOutput().Write($m.ToArray(),0,[int]$m.Length); $m.Dispose()";
    const generated = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 20000, windowsHide: true });
    assert.equal(generated.status, 0, generated.stderr.toString());
    const host = new VoiceHost(profile, () => {});
    await host.configureRecognition(id, 'windows');
    const result = await host.transcribe(id, wave(generated.stdout));
    assert.match(result.text, /hello world/i);
    assert.match(result.text, /please/i);
    assert.ok(result.confidence >= 0.35);
    console.log('Synthetic local speech receipt:', result);
  } finally { await rm(profile, { recursive: true, force: true }); }
});

test('voice profiles persist save/use/rename/delete atomically, serialize changes and reject corrupt recovery', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.intercom-profiles-'));
  try {
    const profiles = new VoiceProfiles(directory, [new WindowsSpeechProvider()]);
    const standard = (await profiles.read()).profiles[0];
    await Promise.all([
      profiles.save({ ...standard, id, name: 'Evening', parameters: { pitch: -4, rate: -2, volume: 35 } }),
      profiles.save({ ...standard, id: '22222222-2222-4222-8222-222222222222', name: 'Quick' }),
    ]);
    let restored = await new VoiceProfiles(directory, [new WindowsSpeechProvider()]).read();
    assert.equal(restored.profiles.length, 3);
    assert.equal(restored.profiles.find((item) => item.id === id).parameters.pitch, -4);
    assert.equal(restored.activeId, '22222222-2222-4222-8222-222222222222');
    await profiles.activate(id);
    await assert.rejects(profiles.remove(id), /active one/);
    await assert.rejects(profiles.save({ ...standard, name: 'Evening' }), /already in use/);
    await profiles.save({ ...restored.profiles.find((item) => item.id === id), name: 'Relaxed' });
    await profiles.remove('default');
    restored = await profiles.read();
    assert.equal(restored.activeId, id);
    assert.equal(restored.profiles.find((item) => item.id === id).name, 'Relaxed');
    await writeFile(path.join(directory, 'voice-profiles.json'), '{malformed');
    await assert.rejects(profiles.read(), /malformed/);
    await writeFile(path.join(directory, 'voice-profiles.json'), 'null');
    await assert.rejects(profiles.read(), /invalid voice profile/);
    await writeFile(path.join(directory, 'voice-profiles.json'), ' '.repeat(65537));
    await assert.rejects(profiles.read(), /supported size/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('profile validation rejects unsupported providers/controls without fallback and a failed save does not poison later writes', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.intercom-profiles-'));
  try {
    const profiles = new VoiceProfiles(directory, [new WindowsSpeechProvider()]);
    const standard = (await profiles.read()).profiles[0];
    assert.throws(() => profiles.save({ ...standard, providerId: 'uninstalled-ai' }), /not installed/);
    for (const parameters of [{ pitch: 13, rate: 1, volume: 100 }, { pitch: 0, rate: 11, volume: 100 },
      { pitch: 0, rate: 1, volume: 101 }, { pitch: 0.1, rate: 1, volume: 100 }, { pitch: 0, rate: 1, volume: 100, emotion: 1 }]) {
      assert.throws(() => profiles.save({ ...standard, parameters }), /must be|Invalid voice controls/);
    }
    await assert.rejects(profiles.activate(id), /no longer exists/);
    await profiles.save({ ...standard, name: 'Valid after rejection' });
    assert.equal((await profiles.read()).profiles[0].name, 'Valid after rejection');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('provider boundary snapshots each utterance, supports independent adapters and preview never changes active settings', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.intercom-profiles-'));
  try {
    const heard = [];
    let release;
    const fake = {
      id: 'future-test-provider',
      validate: (profile) => assert.equal(profile.parameters.style, 2),
      speak: async (text, profile, operation) => {
        heard.push({ text, profile, signal: operation.controller.signal });
        await new Promise((resolve) => { release = resolve; });
      },
    };
    const profiles = new VoiceProfiles(directory, [new WindowsSpeechProvider(), fake]);
    const future = { id, name: 'Future adapter fixture', providerId: fake.id, voiceId: 'original-voice', parameters: { style: 2 } };
    await profiles.save(future);
    const controller = new AbortController();
    const speaking = profiles.speak('A result', null, { cancelled: false, controller });
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    future.parameters.style = 99;
    await profiles.activate('default');
    assert.equal(heard[0].profile.parameters.style, 2);
    controller.abort();
    assert.equal(heard[0].signal.aborted, true);
    release(); await speaking;
    const standard = (await profiles.read()).profiles[0];
    const local = profiles.providers.get('windows-local');
    local.run = async (_operation, mode, input) => heard.push({ mode, input: JSON.parse(input) });
    await profiles.speak('Preview <literal> & text', { ...standard, parameters: { pitch: 5, rate: 3, volume: 70 } }, { cancelled: false });
    assert.deepEqual(heard.at(-1), { mode: 'speak', input: { text: 'Preview <literal> & text', voiceId: null, pitch: 5, rate: 3, volume: 70 } });
    assert.equal((await profiles.read()).activeId, 'default');
    assert.equal((await profiles.read()).profiles[0].parameters.pitch, 0);
    await assert.rejects(profiles.speak('Stopped', null, { cancelled: true }), /cancelled/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('stopped speech cannot claim completion even when a provider resolves after cancellation', async () => {
  const host = new VoiceHost(process.cwd(), () => {});
  let release;
  host.profiles.speak = () => new Promise((resolve) => { release = resolve; });
  const speaking = host.speak('A clarification question.');
  const outcome = assert.rejects(speaking, /Local speech operation cancelled/);
  await host.stopSpeech();
  release();
  await outcome;
  assert.equal(host.speech, null);
});

test('invalid previews preserve current playback and superseded queued speech rejects instead of claiming playback finished', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.intercom-speech-order-'));
  try {
    const host = new VoiceHost(directory, () => {});
    const standard = (await host.profiles.read()).profiles[0];
    host.speech = { child: null, cancelled: false, controller: new AbortController() };
    await assert.rejects(host.speak('Invalid preview', { ...standard, providerId: 'missing-engine' }), /not installed/);
    assert.equal(host.speech.cancelled, false);
    const first = host.speak('Queued first');
    const second = host.speak('Queued second');
    await host.stopSpeech();
    const outcomes = await Promise.allSettled([first, second]);
    assert.ok(outcomes.every((outcome) => outcome.status === 'rejected' && /cancelled/.test(outcome.reason.message)));
    await host.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('installed voice discovery and native pitch, speed, volume and exact voice selection affect actual PCM without playing audio', { skip: process.platform !== 'win32', timeout: 90000 }, async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.intercom-voice-controls-'));
  try {
    const host = new VoiceHost(directory, () => {});
    const [catalog] = await host.voiceCatalog();
    assert.ok(catalog.voices.some((voice) => voice.culture.startsWith('en-')));
    const voice = catalog.voices.find((item) => item.culture === 'en-US') ?? catalog.voices[0];
    const args = await host.speechCommand();
    const render = async (overrides = {}) => {
      const request = { text: 'Hello world. We are testing the speaking voice.', voiceId: voice.id, pitch: 0, rate: 0, volume: 100, ...overrides };
      return JSON.parse(await host.process({ child: null, cancelled: false }, 'powershell.exe', args,
        { mode: 'render', input: JSON.stringify(request), timeout: 20000 }));
    };
    const baseline = Buffer.from((await render()).pcm, 'base64');
    const higher = Buffer.from((await render({ pitch: 12 })).pcm, 'base64');
    const faster = Buffer.from((await render({ rate: 4 })).pcm, 'base64');
    const silent = Buffer.from((await render({ volume: 0 })).pcm, 'base64');
    assert.ok(baseline.some((value) => value !== 0));
    assert.ok(faster.length < baseline.length * 0.9, 'Speed must change actual duration');
    assert.ok(silent.every((value) => value === 0), 'Volume 0 must mute actual PCM');
    function pitch(pcm) {
      const estimates = [];
      for (let start = 0; start + 1024 < pcm.length / 2; start += 512) {
        const samples = Array.from({ length: 1024 }, (_, i) => pcm.readInt16LE(2 * (start + i)) / 32768);
        if (Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) < 0.02) continue;
        const scores = [];
        for (let lag = 32; lag < 230; lag++) {
          let sum = 0, a = 0, b = 0;
          for (let i = 0; i < 768; i++) { sum += samples[i] * samples[i + lag]; a += samples[i] ** 2; b += samples[i + lag] ** 2; }
          scores[lag] = sum / Math.sqrt(a * b);
        }
        const best = Math.max(...scores.slice(32));
        if (best < 0.7) continue;
        for (let lag = 33; lag < 229; lag++) {
          if (scores[lag] >= best * 0.95 && scores[lag] > scores[lag - 1] && scores[lag] > scores[lag + 1]) { estimates.push(16000 / lag); break; }
        }
      }
      estimates.sort((a, b) => a - b);
      assert.ok(estimates.length > 5, 'Need voiced frames, not a byte-hash proxy');
      return estimates[Math.floor(estimates.length / 2)];
    }
    assert.ok(pitch(higher) > pitch(baseline) * 1.1, 'Pitch must increase measured voiced frequency');
    await assert.rejects(render({ voiceId: 'Missing voice fixture' }), /unavailable/);
    await assert.rejects(render({ pitch: 99 }), /supported range/);
    assert.ok(Buffer.from((await render({ text: '<voice> & "literal text"' })).pcm, 'base64').length > 0);
    console.log('Native voice-control receipt:', { voices: catalog.voices.map((item) => item.id), baselineHz: pitch(baseline), raisedHz: pitch(higher) });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
