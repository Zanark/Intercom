const { _electron, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { mkdtemp, mkdir, readFile, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const sessionId = process.env.INTERCOM_LIVE_SESSION_ID;
  const executablePath = process.env.INTERCOM_TEST_EXECUTABLE;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId || '') || !executablePath) throw new Error('Explicit existing session and candidate executable environment variables are required. This test makes one real, conversation-only Copilot request.');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'intercom-live-voice-'));
  let application;
  try {
    const wave = path.join(temporary, 'synthetic-speech.wav');
    const source = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$s = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet, [System.Speech.Synthesis.VoiceAge]::NotSet, 0, [System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
  $s.SetOutputToWaveFile($env:INTERCOM_SYNTHETIC_WAVE)
  $s.SpeakSsml('<speak version="1.0" xml:lang="en-US"><break time="1000ms"/>Say hello world.<break time="4000ms"/></speak>')
} finally { $s.Dispose() }
`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], {
      env: { ...process.env, INTERCOM_SYNTHETIC_WAVE: wave }, windowsHide: true, timeout: 30000,
    });
    application = await _electron.launch({
      executablePath,
      args: [...(process.env.INTERCOM_LIVE_SOURCE === '1' ? [path.join(__dirname, '..')] : []), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wave}`],
      env: { ...process.env, INTERCOM_PROFILE_DIR: path.join(temporary, 'profile') },
    });
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const started = Date.now();
    await page.getByLabel('Existing session ID', { exact: true }).fill(sessionId);
    await page.getByRole('button', { name: 'Connect existing session', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled({ timeout: 30000 });
    await page.getByRole('button', { name: 'Load microphones', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh devices', exact: true })).toBeEnabled();
    const device = await page.getByLabel('Microphone device', { exact: true }).locator('option').evaluateAll((options) => options.find((option) => option.value !== 'default').value);
    await page.getByLabel('Microphone device', { exact: true }).selectOption(device);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue(/hello world/i, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.live-result, [role="alert"]'), null, { timeout: 180000 });
    expect(await page.getByRole('alert').allTextContents()).toEqual([]);
    await expect(page.locator('.live-result')).toContainText(/hello world/i);
    const receipt = JSON.parse(await readFile(path.join(temporary, 'profile', 'last-response.json'), 'utf8'));
    expect(receipt.sessionId).toBe(sessionId);
    expect(receipt.text).toMatch(/hello world/i);
    await expect(page.getByRole('button', { name: 'Stop voice playback', exact: true })).toBeDisabled({ timeout: 30000 });
    expect(await page.getByRole('alert').allTextContents()).toEqual([]);
    expect(errors).toEqual([]);
    await mkdir(path.join(__dirname, '..', '.local'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', '.local', 'voice-live-workspace.png') });
    const evidence = { ...receipt, transcript: await page.getByLabel('Transcript / typed fallback').inputValue(), elapsedMs: Date.now() - started, audio: 'Locally synthesized English WAV via Chromium fake microphone; not physical hardware', speech: 'Native Windows playback completed without reported error', executablePath };
    await writeFile(path.join(__dirname, '..', '.local', 'voice-live-receipt.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ transcript: evidence.transcript, response: receipt.text, elapsedMs: evidence.elapsedMs, speech: evidence.speech }));
  } finally {
    await application?.close();
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
