const { test, expect, _electron } = require('@playwright/test');
const path = require('node:path');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');

let application;
let page;
let profile;
let errors;

test.beforeEach(async () => {
  profile = await mkdtemp(path.join(os.tmpdir(), 'intercom-test-'));
  errors = [];
  const executablePath = process.env.INTERCOM_TEST_EXECUTABLE;
  application = await _electron.launch({
    executablePath,
    args: [...(executablePath ? [] : [path.join(__dirname, '..')]), '--use-fake-device-for-media-stream'],
    env: { ...process.env, INTERCOM_PROFILE_DIR: profile },
  });
  page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
});

test.afterEach(async () => {
  await application?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  expect(errors).toEqual([]);
});

test('real desktop transparency, reversible floating controls and narrow IPC', async () => {
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      preferences: window.webContents.getLastWebPreferences(),
    };
  })).toMatchObject({
    preferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const bounds = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.composer')).toBeHidden();
  expect(await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('canvas').evaluate((canvas) => canvas.getContext('webgl2').getContextAttributes().alpha)).toBe(true);
  const capture = await application.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].capturePage();
    const bitmap = image.toBitmap();
    let visiblePixels = 0;
    for (let index = 3; index < bitmap.length; index += 4) {
      if (bitmap[index] !== 0) visiblePixels++;
    }
    return { cornerAlpha: bitmap[3], visiblePixels };
  });
  expect(capture.cornerAlpha).toBe(0);
  expect(capture.visiblePixels).toBeGreaterThan(100);
  await page.screenshot({ path: test.info().outputPath('floating-mesh.png'), omitBackground: true });
  await page.mouse.move(260, 440);
  await page.getByRole('button', { name: 'Always on top' }).click();
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(bounds);
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await page.getByRole('button', { name: 'Restore workspace' }).focus();
  await page.getByRole('button', { name: 'Restore workspace' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  expect(await page.evaluate(async () => {
    try { await window.intercom.windowAction('execute-shell'); return false; }
    catch { return true; }
  })).toBe(true);
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  await page.screenshot({ path: test.info().outputPath('workspace.png') });
});

test('explicit target confirmation, profile snapshots, cancellation and honest completion', async () => {
  await expect(page.getByLabel('Processing priority', { exact: true })).toHaveValue('Speed / performance');
  await page.getByRole('button', { name: 'Prepare demo request' }).click();
  await expect(page.getByRole('region', { name: 'Demo request confirmation' })).toContainText('Workshop');
  await expect(page.locator('.job-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await page.getByLabel('Processing priority', { exact: true }).selectOption('Accuracy');
  await expect(page.locator('.job-card')).toContainText('Speed / performance snapshot');
  await page.getByRole('button', { name: 'Cancel demo job' }).click();
  await expect(page.locator('.job-card')).toContainText('Demo cancelled');
  await page.waitForTimeout(1200);
  await expect(page.locator('.job-card')).toContainText('Demo cancelled');
  await page.getByRole('button', { name: 'Simulate voice request' }).click();
  await expect(page.getByRole('region', { name: 'Demo request confirmation' })).toContainText('Atlas');
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.locator('.job-card')).toContainText('Accuracy snapshot');
  await expect(page.locator('.job-card')).toContainText('Demo finished - not verified', { timeout: 12000 });
  await expect(page.locator('.job-card')).toContainText('No files changed');
  await page.reload();
  await expect(page.getByLabel('Processing priority', { exact: true })).toHaveValue('Accuracy');
});

test('ambiguity never guesses and context loss retains accessible controls', async () => {
  await page.getByLabel('A VOICE WORKSPACE, IN PREVIEW').fill('Compare Workshop and Atlas');
  await page.getByRole('button', { name: 'Prepare demo request' }).click();
  await expect(page.getByRole('region', { name: 'Demo request confirmation' })).toContainText('missing or ambiguous');
  await expect(page.getByRole('button', { name: 'Run simulation' })).toHaveCount(0);
  await page.locator('.candidate-list').getByRole('button', { name: 'Atlas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Demo request confirmation' })).toHaveCount(0);
  await page.locator('canvas').evaluate((canvas) => {
    const context = canvas.getContext('webgl2');
    context.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('3D graphics context was lost');
  await expect(page.getByRole('button', { name: 'Prepare demo request' })).toBeEnabled();
});

test('idle rendering stays on demand and animation pauses while minimized', async () => {
  await page.addInitScript(() => {
    window.__frameRequests = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      window.__frameRequests++;
      return request(callback);
    };
  });
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(250);
  const idle = await page.evaluate(() => window.__frameRequests);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__frameRequests)).toBe(idle);
  await page.getByRole('button', { name: 'Enable drift' }).click();
  await expect.poll(() => page.evaluate(() => window.__frameRequests)).toBeGreaterThan(idle + 2);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
  await page.waitForTimeout(100);
  const hidden = await page.evaluate(() => window.__frameRequests);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__frameRequests)).toBe(hidden);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await expect.poll(() => page.evaluate(() => window.__frameRequests)).toBeGreaterThan(hidden);
});

test('microphone choice persists, opens only on request, stops tracks and never grants camera access', async () => {
  const microphone = page.getByRole('region', { name: 'Microphone settings' });
  await page.evaluate(() => {
    window.__microphoneTracks = [];
    window.__microphoneRequests = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__microphoneRequests.push(constraints);
      const stream = await getUserMedia(constraints);
      window.__microphoneTracks.push(...stream.getTracks());
      return stream;
    };
  });
  expect(await page.evaluate(() => window.__microphoneRequests.length)).toBe(0);
  await page.getByRole('button', { name: 'Load microphones' }).click();
  await expect(microphone.getByRole('status')).toContainText('Devices loaded. Microphone is off.');
  const device = await page.getByLabel('Microphone device', { exact: true }).locator('option').evaluateAll((options) =>
    options.find((option) => option.value !== 'default').value);
  await page.getByLabel('Microphone device', { exact: true }).selectOption(device);
  await page.getByRole('button', { name: 'Test selected', exact: true }).click();
  await expect(microphone.getByRole('status')).toContainText('Selected microphone checked. Input is off.');
  expect(await page.evaluate(() => window.__microphoneRequests.at(-1))).toEqual({ audio: { deviceId: { exact: device } }, video: false });
  expect(await page.evaluate(() => window.__microphoneTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      return 'unexpected grant';
    } catch (reason) { return reason.name; }
  })).toBe('NotAllowedError');
  await page.reload();
  await expect(page.getByLabel('Microphone device', { exact: true })).toHaveValue(device);
  await page.getByRole('button', { name: 'Load microphones' }).click();
  await expect(microphone.getByRole('status')).toContainText('Devices loaded. Microphone is off.');
  await page.evaluate(() => {
    navigator.mediaDevices.enumerateDevices = async () => [];
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await expect(microphone.getByRole('alert')).toContainText('saved microphone is unavailable');
  await expect(page.getByRole('button', { name: 'Test selected', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Microphone device', { exact: true })).toHaveValue(device);
});

test('microphone denial and enumeration failure are visible and acquired tracks are stopped', async () => {
  await page.evaluate(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__microphoneTracks = [];
    window.__restoreMicrophoneAccess = () => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await getUserMedia(constraints);
        window.__microphoneTracks.push(...stream.getTracks());
        return stream;
      };
    };
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.getByRole('button', { name: 'Load microphones' }).click();
  await expect(page.getByRole('alert')).toContainText('Permission denied');
  await expect(page.getByRole('button', { name: 'Test selected', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    window.__restoreMicrophoneAccess();
    navigator.mediaDevices.enumerateDevices = async () => { throw new Error('device list unavailable'); };
  });
  await page.getByRole('button', { name: 'Load microphones' }).click();
  await expect(page.getByRole('alert')).toContainText('device list unavailable');
  expect(await page.evaluate(() => window.__microphoneTracks.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__microphoneTracks.every((track) => track.readyState === 'ended'))).toBe(true);
});
