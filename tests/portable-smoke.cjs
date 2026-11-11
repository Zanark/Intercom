const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { syntheticTone } = require('./synthetic-audio.cjs');

async function main() {
  const executable = process.env.INTERCOM_TEST_EXECUTABLE;
  if (!executable) throw new Error('Set INTERCOM_TEST_EXECUTABLE to the portable EXE.');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'intercom-portable-'));
  const fakeAudio = path.join(profile, 'synthetic-tone.wav');
  await writeFile(fakeAudio, syntheticTone());
  const child = spawn(executable, ['--remote-debugging-port=0', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeAudio}`], {
    env: { ...process.env, INTERCOM_PROFILE_DIR: profile },
    stdio: 'ignore',
  });
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  let browser;
  let page;
  try {
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
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
    expect(page.url()).toContain('/resources/app.asar/dist/index.html');
    await expect(page.locator('canvas')).toBeVisible();
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
    const microphone = page.getByRole('region', { name: 'Microphone settings' });
    await microphone.getByRole('button', { name: 'Load microphones' }).click();
    await expect(microphone.getByRole('status')).toContainText('Devices loaded. Microphone is off.');
    await microphone.getByRole('button', { name: 'Test selected', exact: true }).click();
    await expect(microphone.getByRole('status')).toContainText('Selected microphone opens successfully.');
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__portableTracks = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__portableTracks.push(...stream.getTracks());
        return stream;
      };
    });
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.__portableTracks.length > 0 && window.__portableTracks.every((track) => track.readyState === 'ended'))).toBe(true);
    await page.getByText('Voice profiles / customize speech', { exact: true }).click();
    await expect(page.locator('.voice-profile-active')).toContainText('Standard');
    await expect(page.getByLabel('Speaking voice / accent').locator('option')).not.toHaveCount(1);
    await page.getByLabel('Voice profile name', { exact: true }).fill('Portable smoke voice');
    await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
    await expect(page.locator('.voice-profile-active')).toContainText('Portable smoke voice');
    await page.reload();
    await page.getByText('Voice profiles / customize speech', { exact: true }).click();
    await expect(page.locator('.voice-profile-active')).toContainText('Portable smoke voice');
    await page.getByText('Voice profiles / customize speech', { exact: true }).click();
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
    await expect(page.getByLabel('Floating window size', { exact: true })).toHaveText('540px');
    await page.getByRole('button', { name: 'Make floating window larger', exact: true }).click();
    await expect(page.getByLabel('Floating window size', { exact: true })).toHaveText('588px');
    await page.getByRole('button', { name: 'Make floating window smaller', exact: true }).click();
    await expect(page.getByLabel('Floating window size', { exact: true })).toHaveText('540px');
    await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('100%');
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ executable, result: 'Actual packaged mesh worker/startup, microphone access and session-independent recording/cancellation, installed voice catalog and persistent profiles, maximize/restore, graph zoom/reset, visible floating handle and native size controls passed', contexts: snapshot.contexts.length, relationships: snapshot.edges.length }));
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => window.intercom.windowAction('close')).catch((error) => {
      if (!/closed|destroyed/i.test(error.message)) throw error;
    });
    await browser?.close();
    if (!spawnError && child.exitCode === null) {
      let timeout;
      try {
        await Promise.race([
          new Promise((resolve) => child.once('exit', resolve)),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Portable process is still running: PID ${child.pid}; profile ${profile}`)), 15000); }),
        ]);
      } finally { clearTimeout(timeout); }
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
