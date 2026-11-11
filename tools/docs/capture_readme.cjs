const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { _electron, expect } = require('@playwright/test');
const { syntheticTone } = require('../../tests/helpers/synthetic-audio.cjs');

const root = path.resolve(__dirname, '..', '..');
const publishSpeaking = process.argv.includes('--readme-speaking');
const bubbleSpeaking = process.argv.includes('--bubble-speaking') || publishSpeaking;
const lane = path.join(root, '.local', bubbleSpeaking ? 'water-refraction-capture' : 'readme-capture');
const runtime = path.join(lane, 'app');
const frames = path.join(lane, 'frames');
const scenes = ['voices', 'workspace', 'floating', 'microphone'];
const bubbleOnly = process.argv.includes('--bubble-only') || bubbleSpeaking;

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
  for (const scene of [...(bubbleOnly ? [] : scenes), 'bubble']) {
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
    const audioPath = path.join(profile, 'synthetic-input.wav');
    let speechDuration;
    if (bubbleSpeaking) {
      const generated = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
        $ErrorActionPreference = 'Stop'
        Add-Type -AssemblyName System.Speech
        $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
        try {
          $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
            16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
            [System.Speech.AudioFormat.AudioChannel]::Mono)
          $speaker.SetOutputToWaveFile($env:INTERCOM_CAPTURE_WAV, $format)
          $speaker.SpeakSsml('<speak version="1.0" xml:lang="en-US"><break time="800ms"/><prosody volume="soft">Hello Intercom.</prosody><break time="450ms"/><prosody volume="medium">The bubble follows my voice.</prosody><break time="500ms"/><prosody volume="loud">Now I am speaking louder.</prosody><break time="700ms"/><prosody volume="soft">And quietly again.</prosody><break time="1000ms"/></speak>')
        } finally { $speaker.Dispose() }
      `], { env: { ...process.env, INTERCOM_CAPTURE_WAV: audioPath }, encoding: 'utf8' });
      if (generated.error) throw generated.error;
      assert.equal(generated.status, 0, `Local synthetic speech failed: ${generated.stderr}`);
      const wave = await fs.readFile(audioPath);
      for (let offset = 12; offset + 8 <= wave.length;) {
        const size = wave.readUInt32LE(offset + 4);
        if (wave.toString('ascii', offset, offset + 4) === 'data') speechDuration = size / 32;
        offset += 8 + size + size % 2;
      }
      assert.ok(speechDuration > 1000 && speechDuration < 20000, 'Expected a bounded 16kHz mono synthetic speech fixture.');
    } else {
      const audio = syntheticTone();
      const samples = (audio.length - 44) / 2;
      for (let i = 0; i < samples; i++) {
        const envelope = 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / samples));
        audio.writeInt16LE(Math.round(audio.readInt16LE(44 + i * 2) * envelope), 44 + i * 2);
      }
      await fs.writeFile(audioPath, audio);
    }
    application = await _electron.launch({
      args: [runtime, '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audioPath}`],
      env: { ...process.env, INTERCOM_PROFILE_DIR: profile, INTERCOM_CONTEXT_MESH_PATH: mesh },
      timeout: 30000,
    });
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
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
      const reflection = page.locator('.mic-film');
      assert.equal(await reflection.evaluate((element) => element.getAnimations()[0]?.playState), 'running');
      const initialTransform = await reflection.evaluate((element) => globalThis.getComputedStyle(element).transform);
      for (let i = 0; i < 60; i++) {
        const start = Date.now();
        await action(i);
        await page.screenshot({
          path: path.join(frames, scene, `${String(i).padStart(3, '0')}.png`),
          omitBackground: true,
        });
        await page.waitForTimeout(Math.max(0, 100 - (Date.now() - start)));
      }
      assert.notEqual(await reflection.evaluate((element) => globalThis.getComputedStyle(element).transform), initialTransform,
        `${scene}: the glass surface must rotate in 3D.`);
      console.log(`Captured ${scene}: 60 real GUI frames.`);
    }
    let transparency;
    if (!bubbleOnly) {
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
    transparency = await application.evaluate(async ({ BrowserWindow }) => {
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
    await expect.poll(() => page.locator('.mic-ripples').evaluate((surface) => Number(surface.dataset.energy))).toBeGreaterThan(.01);
    await record('microphone');
    await page.getByRole('button', { name: 'Voice settings and transcript', exact: true }).click();
    await settings('Talk');
    await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
    await expect(page.getByRole('meter')).toHaveCount(0);
    }
    const viewport = await page.evaluate(() => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }));
    const cdp = await page.context().newCDPSession(page);
    let bubbleClip;
    let bubbleFrames;
    let bubbleDuration;
    const levels = [];
    try {
      bubbleDuration = await page.locator('.mic-film').evaluate((element) => {
        const animations = element.getAnimations();
        if (animations.length !== 1 || animations[0].playState !== 'running') {
          throw new Error('Bubble capture requires the actual running surface animation.');
        }
        return animations[0].effect.getTiming().duration;
      });
      if (bubbleSpeaking) {
        await page.evaluate((duration) => {
          globalThis.__bubbleTracks = [];
          const original = globalThis.AudioContext.prototype.createMediaStreamSource;
          globalThis.AudioContext.prototype.createMediaStreamSource = function (stream) {
            globalThis.__bubbleTracks.push(...stream.getTracks());
            const source = original.call(this, stream);
            const gain = this.createGain();
            source.connect(gain);
            gain.gain.setValueAtTime(1, this.currentTime);
            gain.gain.setValueAtTime(0, this.currentTime + duration / 1000);
            return gain;
          };
        }, speechDuration);
        await page.getByRole('button', { name: 'Speak', exact: true }).click();
        await expect(page.getByRole('meter')).toHaveCount(1);
        bubbleDuration = Math.ceil(speechDuration / 50) * 50 + 2000;
      } else {
        await page.locator('.mic-film').evaluate((element) => element.getAnimations()[0].pause());
      }
      assert.equal(typeof bubbleDuration, 'number');
      bubbleFrames = bubbleDuration / 50;
      assert.ok(Number.isInteger(bubbleFrames) && bubbleFrames > 0 && bubbleFrames <= 2000);
      const bounds = await page.locator('.record-button').boundingBox();
      assert.ok(bounds && bounds.width === 60 && bounds.height === 60);
      bubbleClip = {
        x: Math.max(0, Math.min(viewport.width - 84, bounds.x + bounds.width / 2 - 42)),
        y: Math.max(0, Math.min(viewport.height - 84, bounds.y + bounds.height / 2 - 42)),
        width: 84, height: 84,
      };
      for (let i = 0; i < bubbleFrames; i++) {
        const start = Date.now();
        if (bubbleSpeaking) {
          levels.push(await page.locator('.record-button').evaluate((button) => ({
            rms: globalThis.document.querySelector('meter').value,
            scale: new globalThis.DOMMatrix(globalThis.getComputedStyle(button.querySelector('.mic-shell')).transform).a,
            refracting: button.querySelector('.mic-ripples').dataset.active === 'true',
            energy: Number(button.querySelector('.mic-ripples').dataset.energy),
            waveStrength: Number(button.querySelector('.mic-ripples').dataset.strength || 0),
            surfaceFrames: Number(button.querySelector('.mic-ripples').dataset.frames || 0),
          })));
        } else {
          await page.locator('.mic-film').evaluate(async (element, time) => {
            element.getAnimations()[0].currentTime = time;
            await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
          }, i * 50);
        }
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'png', clip: { ...bubbleClip, scale: 3 }, captureBeyondViewport: true,
        });
        const png = Buffer.from(screenshot.data, 'base64');
        assert.equal(png.readUInt32BE(16), 252, 'Bubble capture must be three times the CSS crop width.');
        assert.equal(png.readUInt32BE(20), 252, 'Bubble capture must be three times the CSS crop height.');
        await fs.writeFile(path.join(frames, 'bubble', `${String(i).padStart(3, '0')}.png`), png);
        if (bubbleSpeaking) await page.waitForTimeout(Math.max(0, 50 - (Date.now() - start)));
      }
      if (bubbleSpeaking) {
        assert.ok(Math.max(...levels.map((sample) => sample.rms)) > .03, 'Synthetic speech must reach the actual input meter.');
        assert.ok(levels.every((sample) => Math.abs(sample.scale - 1) < .001), 'Refraction must not grow the glass shell.');
        assert.ok(levels.some((sample) => sample.refracting && sample.energy > .01), 'Actual input must disturb the refractive water surface.');
        assert.ok(levels.at(-1).rms < .001 && !levels.at(-1).refracting && levels.at(-1).energy === 0,
          'Refraction must settle and stop during final silence.');
        await page.getByRole('button', { name: 'Voice settings and transcript', exact: true }).click();
        await settings('Talk');
        await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
        await expect(page.getByRole('meter')).toHaveCount(0);
        assert.equal(await page.evaluate(() => globalThis.__bubbleTracks.every((track) => track.readyState === 'ended')), true);
      }
      console.log(`Captured bubble: ${bubbleFrames} actual renderer samples (${bubbleSpeaking ? 'synthetic speech and independent surface refraction' : 'full 3D motion loop'}).`);
    } finally {
      await cdp.detach();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(await application.evaluate(() => globalThis.__blockedCaptureActions), []);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await fs.writeFile(path.join(frames, 'receipt.json'), JSON.stringify({
      source: 'Local source build; not the published prototype.12',
      capture: 'Hidden offscreen Electron; unmodified renderer and preload',
      inputs: `48 fictional contexts, 144 structural connections and ${bubbleSpeaking ? 'local Windows synthetic speech' : 'enveloped synthetic tone'}`,
      readiness: 'Recognition readiness stubbed; no recognition or delivery',
      safety: 'No visible window, physical microphone, session dispatch or playback',
      scenes: bubbleOnly ? [] : scenes, framesPerScene: 60, fps: 10, transparency,
      reflection: 'Original glass restored without threads; six soft surface patches rotate on all three axes',
      ripples: 'Measured input disturbs a damped 64x64 height field; surface slopes refract glass reflections and produce soft directional light/shade; icon and rim remain undistorted; independent glass rotation; no drawn rings',
      bubble: { frames: bubbleFrames, fps: 20, durationMs: bubbleDuration, captureScale: 3, clip: bubbleClip,
        mode: bubbleSpeaking ? 'speaking' : 'idle', levels,
        sampling: bubbleSpeaking ? 'Actual recording pipeline with synthetic speech; real-time 50ms sampling, not a hardware benchmark'
          : 'Idle actual renderer, deterministic Web Animation currentTime sampling; no recording' },
    }, null, 2));
  } finally {
    if (application) await application.close();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  const encoding = bubbleOnly
    ? ['--bubble-frames', path.join(frames, 'bubble'), '--output-dir',
      publishSpeaking ? path.join(root, 'docs', 'assets', 'readme') : lane]
    : ['--gui-frames', frames];
  const result = spawnSync('python', [path.join(__dirname, 'render_readme.py'), ...encoding], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'GUI GIF encoding failed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
