const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm, writeFile, stat, rename } = require('node:fs/promises');
const { fileURLToPath } = require('node:url');
const os = require('node:os');
const path = require('node:path');
const { VoiceHost } = require('../../desktop/services/voice.cjs');
const { syntheticTone } = require('../helpers/synthetic-audio.cjs');

async function trackAudio(page) {
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__portableTracks = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__portableTracks.push(...stream.getTracks());
      return stream;
    };
  });
}

async function main() {
  const executable = process.env.INTERCOM_TEST_EXECUTABLE;
  if (!executable) throw new Error('Set INTERCOM_TEST_EXECUTABLE to the portable EXE.');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'intercom-portable-'));
  const fakeAudio = path.join(profile, 'synthetic-tone.wav');
  const host = new VoiceHost(profile, () => {});
  let child;
  let spawnError;
  let browser;
  let page;
  let receipt;
  let recognitionPid;
  try {
    const rendered = JSON.parse(await host.process({ child: null, cancelled: false }, 'powershell.exe', await host.speechCommand(), {
      mode: 'render', input: JSON.stringify({ text: 'Please refresh session X. Do not check session Y.', voiceId: null, pitch: 0, rate: 0, volume: 100 }),
    }));
    const audio = Buffer.concat([syntheticTone().subarray(0, 44), Buffer.alloc(12800), Buffer.from(rendered.pcm, 'base64'), Buffer.alloc(25600)]);
    audio.writeUInt32LE(audio.length - 8, 4);
    audio.writeUInt32LE(audio.length - 44, 40);
    await writeFile(fakeAudio, audio);
    child = spawn(executable, ['--remote-debugging-port=0', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeAudio}`], {
      env: { ...process.env, INTERCOM_PROFILE_DIR: profile },
      stdio: 'ignore',
    });
    child.on('error', (error) => { spawnError = error; });
    let port;
    const deadline = Date.now() + 120000;
    while (!port && Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Portable launcher exited early: ${child.exitCode}`);
      try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!port) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!port) throw new Error(`Portable app did not expose its isolated debugging endpoint. Launcher PID: ${child.pid}; profile: ${profile}`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    page = browser.contexts()[0].pages()[0];
    if (!page) throw new Error('Portable app opened no renderer.');
    const errors = [];
    const settings = (tab) => page.getByRole('tablist', { name: 'Workspace settings', exact: true }).getByRole('tab', { name: tab, exact: true }).click();
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
    expect(page.url()).toContain('/resources/app.asar/dist/index.html');
    await expect(page.locator('canvas[role="img"]')).toBeVisible();
    await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH');
    const snapshot = await page.evaluate(() => window.intercom.loadContextMesh());
    expect(snapshot.demo).toBe(false);
    expect(snapshot.contexts.length).toBeGreaterThan(0);
    await expect(page.getByRole('img', { name: new RegExp(`Actual local Context Mesh: ${snapshot.contexts.length} contexts and ${snapshot.edges.length} evidence-backed relationships`) })).toBeVisible();
    const logo = page.getByRole('img', { name: 'Intercom logo', exact: true });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate(async (image) => {
      await image.decode();
      return image.naturalWidth;
    })).toBe(256);
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.intercom.recognitionSettings())).toMatchObject({
      source: 'bundled', engine: 'whisper', backend: 'vulkan', language: 'auto', ready: true,
    });
    await expect(readFile(path.join(profile, 'recognition-settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await trackAudio(page);
    expect(await page.evaluate(() => window.__portableTracks.length)).toBe(0);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible({ timeout: 20000 });
    await settings('Talk');
    await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    expect(await page.evaluate(() => window.__portableTracks.length > 0 && window.__portableTracks.every((track) => track.readyState === 'ended'))).toBe(true);
    const warmRecognition = await page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()));
    expect(warmRecognition).toMatchObject({ transport: 'warm-private-pipe', backend: 'vulkan', warm: true });
    expect(warmRecognition.pid).toBeGreaterThan(0);
    recognitionPid = warmRecognition.pid;
    const resources = path.resolve(path.dirname(fileURLToPath(page.url())), '..', '..');
    const model = path.join(resources, 'speech', 'ggml-large-v3-turbo-q5_0.bin');
    const beforeDuplicate = await stat(model);
    // A second launcher must not remove resources from the already running app.
    const duplicate = spawn(executable, [], { env: { ...process.env, INTERCOM_PROFILE_DIR: profile }, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        duplicate.kill();
        reject(new Error(`Duplicate portable launcher did not exit: owned PID ${duplicate.pid}`));
      }, 120000);
      duplicate.once('error', (error) => { clearTimeout(timer); reject(error); });
      duplicate.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Duplicate portable launcher exited ${code}.`));
      });
    });
    const afterDuplicate = await stat(model);
    expect(afterDuplicate.size).toBe(beforeDuplicate.size);
    expect(afterDuplicate.mtimeMs).toBe(beforeDuplicate.mtimeMs);
    expect((await page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()))).pid).toBe(recognitionPid);
    await expect.poll(async () => readFile(path.join(profile, 'diagnostics', 'events.jsonl'), 'utf8')).toContain('"event":"app.second-instance"');
    await settings('Advanced');
    await expect(page.getByLabel('Processing priority', { exact: true })).toHaveValue('Speed / performance');
    await settings('Session');
    await expect(page.getByLabel('Voice request destination')).toHaveValue('orchestrate');
    await settings('Voice');
    await expect(page.getByRole('checkbox', { name: 'Speak progress and responses (local Windows voice)' })).toBeChecked();
    await settings('Input');
    const microphone = page.getByRole('region', { name: 'Microphone settings' });
    await expect(microphone.getByLabel('Microphone device', { exact: true })).toHaveValue('default');
    await microphone.getByRole('button', { name: 'Load microphones' }).click();
    await expect(microphone.getByRole('status')).toContainText('Devices loaded. Microphone is off.');
    await microphone.getByRole('button', { name: 'Test selected', exact: true }).click();
    await expect(microphone.getByRole('status')).toContainText('Signal detected; microphone is off.');
    await expect(microphone.getByLabel('Microphone diagnostics')).toContainText('Recognition: 16000 Hz, mono PCM16.');
    let localSpeech;
    let liveSpeech;
    {
      await settings('Talk');
      await page.getByLabel('Transcript / typed fallback').fill('Keep this unsent draft.');
      await settings('Input');
      await page.getByRole('tab', { name: 'Recognition', exact: true }).click();
      await expect(page.getByLabel('Recognition language', { exact: true })).toHaveValue('auto');
      await expect(page.getByText('Included local speech is selected automatically;', { exact: false })).toBeVisible();
      await page.getByRole('tab', { name: 'Speech check', exact: true }).click();
      await page.getByRole('button', { name: 'Test speech locally', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(6500);
      await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
      await expect(page.getByLabel('Local test transcript')).toBeVisible({ timeout: 60000 });
      localSpeech = await page.getByLabel('Local test transcript').inputValue();
      expect(localSpeech).toMatch(/refresh session X/i);
      expect(localSpeech).toMatch(/not check session Y/i);
      expect((await page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()))).pid).toBe(recognitionPid);
      await settings('Talk');
      await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep this unsent draft.');
    }
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
    await settings('Advanced');
    await page.getByRole('checkbox', { name: 'Send recognized text automatically after stopping', exact: true }).uncheck();
    await settings('Talk');
    const liveToggle = page.getByRole('checkbox', { name: 'Live transcription (local draft)', exact: true });
    await expect(liveToggle).not.toBeChecked();
    await liveToggle.check();
    await trackAudio(page);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0);
    await expect(page.getByLabel('Transcript / typed fallback')).not.toHaveValue('', { timeout: 60000 });
    await expect(page.getByLabel('Transcript / typed fallback')).not.toHaveValue('Keep this unsent draft.', { timeout: 60000 });
    const liveDraft = await page.getByLabel('Transcript / typed fallback').inputValue();
    await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled({ timeout: 60000 });
    liveSpeech = await page.getByLabel('Transcript / typed fallback').inputValue();
    expect(liveSpeech).toMatch(/refresh session X/i);
    expect(liveSpeech).toMatch(/not check session Y/i);
    expect(liveDraft.trim()).not.toBe('');
    expect((await page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()))).pid).toBe(recognitionPid);
    await expect(page.locator('.live-result')).toHaveCount(0);
    await liveToggle.uncheck();
    expect(await page.evaluate(() => window.__portableTracks.length > 0 && window.__portableTracks.every((track) => track.readyState === 'ended'))).toBe(true);
    await settings('Voice');
    await expect(page.locator('.voice-profile-active')).toContainText('Standard');
    await expect(page.getByLabel('Speaking voice / accent').locator('option')).not.toHaveCount(1);
    await page.getByRole('tablist', { name: 'Speaking voice categories', exact: true }).getByRole('tab', { name: 'Profiles', exact: true }).click();
    await page.getByLabel('Voice profile name', { exact: true }).fill('Portable smoke voice');
    await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
    await expect(page.locator('.voice-profile-active')).toContainText('Portable smoke voice');
    await page.reload();
    await settings('Voice');
    await expect(page.locator('.voice-profile-active')).toContainText('Portable smoke voice');
    await page.getByRole('button', { name: 'Maximize window', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-maximized', 'true');
    await page.getByRole('button', { name: 'Restore window', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-maximized', 'false');
    await page.getByRole('button', { name: 'Zoom in graph', exact: true }).click();
    await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('125%');
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('100%');
    await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
    expect(await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await expect(page.getByLabel('Move floating mesh', { exact: true })).toHaveText('Drag to move');
    await expect(page.getByRole('button', { name: 'Expand floating controls', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
    await trackAudio(page);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
    await page.getByRole('button', { name: 'Conversation and transcript', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Cancelled');
    await expect(page.getByRole('alert')).toBeInViewport();
    expect(await page.evaluate(() => window.__portableTracks.length > 0 && window.__portableTracks.every((track) => track.readyState === 'ended'))).toBe(true);
    await page.getByRole('button', { name: 'Conversation and transcript', exact: true }).click();
    await expect(page.getByLabel('Floating window size', { exact: true })).toHaveText('540px');
    await page.getByRole('button', { name: 'Make floating window larger', exact: true }).click();
    await expect(page.getByLabel('Floating window size', { exact: true })).toHaveText('588px');
    await page.getByRole('button', { name: 'Make floating window smaller', exact: true }).click();
    await expect(page.getByLabel('Floating window size', { exact: true })).toHaveText('540px');
    await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('100%');
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
    await expect(readFile(path.join(profile, 'recognition-settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(errors).toEqual([]);
    const diagnosticLog = await readFile(path.join(profile, 'diagnostics', 'events.jsonl'), 'utf8');
    expect(diagnosticLog).not.toContain(localSpeech);
    expect(diagnosticLog).not.toContain(liveSpeech);
    expect(diagnosticLog).toContain('"component":"recognition"');
    const faultFile = model + '.fault-test';
    await rename(model, faultFile);
    try {
      await expect(page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()))).rejects.toThrow('Local multilingual recognition is not ready');
      const failure = JSON.parse(await readFile(path.join(profile, 'diagnostics', 'last-failure.json'), 'utf8'));
      expect(failure.operation).toBe('voice:recognition-ready');
      expect(failure.error.code).toBe('ENOENT');
      expect(failure.snapshot.resources.find((file) => file.name.endsWith('ggml-large-v3-turbo-q5_0.bin')).exists).toBe(false);
      expect(failure.snapshot.processes.length).toBeGreaterThan(0);
    } finally { await rename(faultFile, model); }
    const recovered = await page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()));
    expect(recovered.pid).not.toBe(recognitionPid);
    recognitionPid = recovered.pid;
    receipt = { executable, result: 'Fresh portable defaults, duplicate launcher refusal without resource deletion, repeated native transcription/live drafts/final recognition, content-free persistent diagnostics, automatic missing-model process/resource snapshot and explicit recovery, exclusions, no automatic send, cancellation/track release, voice profiles and window controls passed.', isolatedPortableResources: resources, duplicateLauncherPreservedModel: true, missingModelSnapshotAndRecovery: true, warmRecognitionReused: true, localSpeech, liveSpeech, contexts: snapshot.contexts.length, relationships: snapshot.edges.length };
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => window.intercom.windowAction('close')).catch((error) => {
      if (!/closed|destroyed/i.test(error.message)) throw error;
    });
    await browser?.close();
    await host.close();
    if (child && !spawnError && child.exitCode === null) {
      let timeout;
      try {
        await Promise.race([
          new Promise((resolve) => child.once('exit', resolve)),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Portable process is still running: PID ${child.pid}; profile ${profile}`)), 60000); }),
        ]);
      } finally { clearTimeout(timeout); }
    }
    if (recognitionPid) {
      expect(() => process.kill(recognitionPid, 0)).toThrow();
      if (receipt) receipt.warmRecognitionStoppedOnClose = true;
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
  console.log(JSON.stringify(receipt));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
