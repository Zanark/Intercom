const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const executable = process.env.INTERCOM_TEST_EXECUTABLE;
  if (!executable) throw new Error('Set INTERCOM_TEST_EXECUTABLE to the portable EXE.');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'intercom-portable-'));
  const child = spawn(executable, ['--remote-debugging-port=0', '--use-fake-device-for-media-stream'], {
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
    const microphone = page.getByRole('region', { name: 'Microphone settings' });
    await microphone.getByRole('button', { name: 'Load microphones' }).click();
    await expect(microphone.getByRole('status')).toContainText('Devices loaded. Microphone is off.');
    await microphone.getByRole('button', { name: 'Test selected', exact: true }).click();
    await expect(microphone.getByRole('status')).toContainText('Selected microphone checked. Input is off.');
    await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
    expect(await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
    expect(errors).toEqual([]);
    console.log(`Portable EXE passed: ${executable}`);
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
