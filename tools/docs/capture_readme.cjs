const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { _electron, expect } = require('@playwright/test');
const { syntheticTone } = require('../../tests/helpers/synthetic-audio.cjs');

const root = path.resolve(__dirname, '..', '..');
const lane = path.join(root, '.local', 'readme-capture');
const runtime = path.join(lane, 'app');
const frames = path.join(lane, 'frames');
const scenes = ['voices', 'workspace', 'floating', 'microphone'];

async function main() {
  await fs.access(path.join(runtime, 'dist', 'index.html'));
  await fs.cp(path.join(root, 'desktop'), path.join(runtime, 'desktop'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(runtime, 'package.json'));
  const entry = path.join(runtime, 'desktop', 'main.cjs');
  let host = (await fs.readFile(entry, 'utf8')).replace(/\r\n/g, '\n');
  for (const [before, after] of [
    ['paused: !!window && (window.isMinimized() || !window.isVisible()),', 'paused: false,'],
    ['backgroundThrottling: true,', 'backgroundThrottling: false,\n      offscreen: true,'],
    ['\n  window.show();\n', '\n  // Documentation capture stays offscreen; never show or focus this window.\n'],
  ]) {
    assert.equal(host.split(before).length, 2, `Capture host contract changed: ${before}`);
    host = host.replace(before, after);
  }
  await fs.writeFile(entry, host);
  await fs.mkdir(frames, { recursive: true });
  for (const scene of scenes) {
    const directory = path.join(frames, scene);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.mkdir(directory);
  }
  const profile = await fs.mkdtemp(path.join(lane, 'profile-'));
  let application;
  try {
    const names = ['Atlas', 'Workshop', 'Studio', 'Library', 'Compass', 'Garden'];
    const contexts = Array.from({ length: 48 }, (_, i) => {
      const name = `${names[i % names.length]}-${String(Math.floor(i / names.length) + 1).padStart(2, '0')}`;
      return {
        id: name.toLowerCase(), name, basePath: `C:\\Intercom-Demo\\${name}`,
        freshness: { label: 'fresh' },
      };
    });
    const colors = ['#b84838', '#a85c27', '#7f3f91', '#a83b61', '#9a6922', '#5c4ba6'];
    const mesh = path.join(profile, 'demo-mesh.json');
    await fs.writeFile(mesh, JSON.stringify({
      schemaVersion: 1, generatedAt: new Date().toISOString(), contexts,
      graph: {
        nodes: contexts.map((context, i) => ({ id: context.id, type: 'context', outlineColor: colors[i % colors.length] })),
        edges: contexts.flatMap((context, i) => [1, 6, 17].map((offset) => ({
          source: context.id, target: contexts[(i + offset) % contexts.length].id,
          type: 'cross-reference', confidence: 'high', relationshipClass: 'structural',
        }))),
      },
    }));
    await fs.writeFile(path.join(profile, 'recognition-settings.json'), JSON.stringify({ version: 1, engine: 'windows' }));
    const audio = syntheticTone();
    const samples = (audio.length - 44) / 2;
    for (let i = 0; i < samples; i++) {
      const envelope = 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / samples));
      audio.writeInt16LE(Math.round(audio.readInt16LE(44 + i * 2) * envelope), 44 + i * 2);
    }
    const audioPath = path.join(profile, 'synthetic-input.wav');
    await fs.writeFile(audioPath, audio);
    application = await _electron.launch({
      args: [runtime, '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audioPath}`],
      env: { ...process.env, INTERCOM_PROFILE_DIR: profile, INTERCOM_CONTEXT_MESH_PATH: mesh },
      timeout: 30000,
    });
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
    await expect(page.getByText('ACTUAL LOCAL MESH', { exact: true })).toBeVisible();
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await application.evaluate(({ ipcMain }) => {
      globalThis.__blockedCaptureActions = [];
      for (const action of ['voice:configure', 'voice:transcribe', 'voice:send', 'voice:speak', 'voice:preview',
        'work:sessions', 'work:prepare', 'work:confirm', 'work:approve', 'orchestration:request', 'orchestration:approve']) {
        ipcMain.removeHandler(action);
        ipcMain.handle(action, () => {
          globalThis.__blockedCaptureActions.push(action);
          throw new Error('Session, transcription and playback actions are disabled in documentation capture.');
        });
      }
      ipcMain.removeHandler('voice:recognition-ready');
      ipcMain.handle('voice:recognition-ready', () => ({ ready: true, engine: 'windows' }));
    });
    const settings = (name) => page.getByRole('tablist', { name: 'Workspace settings', exact: true })
      .getByRole('tab', { name, exact: true }).click();
    async function record(scene, action = async () => {}) {
      for (let i = 0; i < 60; i++) {
        const start = Date.now();
        await action(i);
        await page.screenshot({
          path: path.join(frames, scene, `${String(i).padStart(3, '0')}.png`),
          omitBackground: true,
        });
        await page.waitForTimeout(Math.max(0, 100 - (Date.now() - start)));
      }
      console.log(`Captured ${scene}: 60 real GUI frames.`);
    }
    await settings('Advanced');
    await page.getByRole('tablist', { name: 'Advanced categories' }).getByRole('tab', { name: 'Display', exact: true }).click();
    await page.getByRole('button', { name: 'Enable drift', exact: true }).click();
    await settings('Voice');
    await page.getByLabel('Speak progress and responses (local Windows voice)').uncheck();
    await expect(page.getByRole('tablist', { name: 'Speaking voice categories' })).toBeVisible({ timeout: 30000 });
    const voiceTab = (name) => page.getByRole('tablist', { name: 'Speaking voice categories' })
      .getByRole('tab', { name, exact: true }).click();
    await record('voices', async (i) => {
      if (i === 15) await voiceTab('Tune');
      if (i === 25) {
        await page.locator('#voice-pitch').focus();
        await page.keyboard.press('ArrowRight');
      }
      if (i === 35) {
        await page.locator('#voice-rate').focus();
        await page.keyboard.press('ArrowRight');
      }
      if (i === 48) await voiceTab('Voice');
    });
    await settings('Talk');
    const graph = await page.locator('.center canvas').boundingBox();
    assert.ok(graph && graph.width > 100 && graph.height > 100, 'Rendered graph is required.');
    await record('workspace', async (i) => {
      if (i === 10) {
        await page.mouse.move(graph.x + graph.width * 0.4, graph.y + graph.height * 0.55);
        await page.mouse.down();
      }
      if (i > 10 && i < 30) await page.mouse.move(graph.x + graph.width * (0.4 + (i - 10) / 80), graph.y + graph.height * 0.55);
      if (i === 30) await page.mouse.up();
      if (i === 40) await page.mouse.wheel(0, -180);
      if (i === 50) await page.mouse.wheel(0, 180);
    });
    await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
    const transparency = await application.evaluate(async ({ BrowserWindow }) => {
      const bitmap = (await BrowserWindow.getAllWindows()[0].capturePage()).toBitmap();
      let visiblePixels = 0;
      for (let i = 3; i < bitmap.length; i += 4) if (bitmap[i]) visiblePixels++;
      return { cornerAlpha: bitmap[3], visiblePixels };
    });
    assert.equal(transparency.cornerAlpha, 0);
    assert.ok(transparency.visiblePixels > 100);
    await record('floating', async (i) => {
      if (i === 20) await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
      if (i === 44) await page.getByRole('button', { name: 'Collapse floating controls', exact: true }).click();
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0.01);
    await record('microphone');
    await page.getByRole('button', { name: 'Voice settings and transcript', exact: true }).click();
    await settings('Talk');
    await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    assert.deepEqual(await application.evaluate(() => globalThis.__blockedCaptureActions), []);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await fs.writeFile(path.join(frames, 'receipt.json'), JSON.stringify({
      source: 'Local source build; not the published prototype.12',
      capture: 'Hidden offscreen Electron; unmodified renderer and preload',
      inputs: '48 fictional contexts, 144 structural connections and enveloped synthetic tone',
      readiness: 'Recognition readiness stubbed; no recognition or delivery',
      safety: 'No visible window, physical microphone, session dispatch or playback',
      scenes, framesPerScene: 60, fps: 10, transparency,
    }, null, 2));
  } finally {
    if (application) await application.close();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  const result = spawnSync('python', [path.join(__dirname, 'render_readme.py'), '--gui-frames', frames], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'GUI GIF encoding failed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
