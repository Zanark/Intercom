const { _electron, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const sessionId = process.env.INTERCOM_LIVE_SESSION_ID;
  const executablePath = process.env.INTERCOM_TEST_EXECUTABLE;
  if (process.env.INTERCOM_LIVE_READONLY_APPROVED !== '1' || !/^[0-9a-f-]{36}$/i.test(sessionId || '') || !executablePath) {
    throw new Error('Requires explicit approval of the read-only Get-Location test, an existing session and candidate executable. This changes that session to manual Agent mode.');
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'intercom-live-work-'));
  const output = path.join(__dirname, '..', '..', '.local');
  let application;
  let succeeded = false;
  const receipt = { startedAt: new Date().toISOString(), executablePath, audio: 'Locally synthesized speech through a selected Chromium fake microphone; not physical hardware', permissions: [] };
  try {
    const wave = path.join(temporary, 'speech.wav');
    const source = `
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
      args: [...(process.env.INTERCOM_LIVE_SOURCE === '1' ? [path.join(__dirname, '..', '..')] : []),
        '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wave}`],
      env: { ...process.env, INTERCOM_PROFILE_DIR: path.join(temporary, 'profile') },
    });
    await application.evaluate(({ app }) => {
      globalThis.__workEvidence = { updates: [], speech: [] };
      const require = process.getBuiltinModule('node:module').createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(), 'package.json'));
      const { AcpClient } = require(require('node:path').join(app.getAppPath(), 'desktop', 'services', 'acp.cjs'));
      const accept = AcpClient.prototype.accept;
      AcpClient.prototype.accept = function (message) {
        if (this.ready && message.method === 'session/update') globalThis.__workEvidence.updates.push(message.params.update);
        return accept.call(this, message);
      };
      const { VoiceHost } = require(require('node:path').join(app.getAppPath(), 'desktop', 'services', 'voice.cjs'));
      const speak = VoiceHost.prototype.speak;
      VoiceHost.prototype.speak = async function (text) {
        await speak.call(this, text);
        globalThis.__workEvidence.speech.push({ text, completedAt: new Date().toISOString() });
      };
    });
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH', { timeout: 30000 });
    const mesh = await page.evaluate(() => window.intercom.loadContextMesh());
    const context = mesh.contexts.find((item) => item.basePath.toLowerCase() === path.resolve(__dirname, '..', '..').toLowerCase());
    if (!context) throw new Error('The actual mesh does not contain this exact workspace.');
    receipt.mesh = { contexts: mesh.contexts.length, relationships: mesh.edges.length, generatedAt: mesh.generatedAt, loadedAt: mesh.loadedAt };
    await page.getByLabel('Target context', { exact: true }).selectOption(context.id);
    await page.getByLabel('Voice request destination').selectOption('background');
    await page.getByRole('button', { name: 'Load microphones', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh devices', exact: true })).toBeEnabled();
    const device = await page.getByLabel('Microphone device', { exact: true }).locator('option').evaluateAll((options) => options.find((option) => option.value !== 'default').value);
    await page.getByLabel('Microphone device', { exact: true }).selectOption(device);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByLabel('Confirmed task', { exact: true })).toHaveValue(/hello world/i, { timeout: 20000 });
    receipt.transcript = await page.getByLabel('Transcript / typed fallback').inputValue();
    // The operator approved this exact bounded test; review/edit remains a visible UI step.
    const safeTask = 'Acceptance test: run only the literal PowerShell command Get-Location, then reply "Hello world." Do not write files, access the network, or use any other tool or command. If that exact operation is not possible, stop and explain.';
    await page.getByLabel('Confirmed task', { exact: true }).fill(safeTask);
    await page.getByRole('button', { name: 'Find existing sessions', exact: true }).click();
    await expect(page.getByLabel('Choose an existing session', { exact: true }).locator(`option[value="${sessionId}"]`)).toBeEnabled({ timeout: 120000 });
    await page.getByLabel('Choose an existing session', { exact: true }).selectOption(sessionId);
    await page.getByRole('button', { name: 'Review target and task', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Real work confirmation' })).toContainText(safeTask, { timeout: 120000 });
    await page.getByRole('button', { name: 'Confirm this target and task', exact: true }).click();
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await page.waitForFunction(() => document.querySelector('.permission-request') || document.querySelector('.real-job button')?.textContent === 'Acknowledge receipt' ||
        [...document.querySelectorAll('.real-job strong')].some((item) => /review the result|attention|unknown|stopped/i.test(item.textContent)), null, { timeout: Math.max(1000, deadline - Date.now()) });
      const job = await page.evaluate(() => window.intercom.workState());
      if (job?.permission) {
        const details = JSON.parse(job.permission.details);
        const permitted = details.rawInput?.command?.trim() === 'Get-Location' && receipt.permissions.filter((item) => item.allowed).length === 0;
        receipt.permissions.push({ details, allowed: permitted });
        await page.getByRole('button', { name: permitted ? 'Allow this operation once' : 'Reject this operation', exact: true }).click();
        if (!permitted) throw new Error('Unexpected permission request was rejected. No retry made.');
      } else if (job?.completedAt) { receipt.job = job; break; }
    }
    receipt.job ??= await page.evaluate(() => window.intercom.workState());
    expect(receipt.job.phase).toBe('responded');
    expect(receipt.job.sessionId).toBe(sessionId);
    expect(receipt.job.text).toMatch(/hello world/i);
    expect(receipt.job.effective.approval).toContain('Manual');
    expect(receipt.job.effective.effort).toBe('low');
    await expect.poll(async () => application.evaluate(() => globalThis.__workEvidence.speech.some((item) => item.text.includes('Copilot has finished responding'))), { timeout: 60000 }).toBe(true);
    receipt.runtime = await application.evaluate(() => globalThis.__workEvidence);
    const commands = receipt.runtime.updates.filter((item) => item.rawInput?.command).map((item) => item.rawInput.command.trim());
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command === 'Get-Location')).toBe(true);
    expect(receipt.runtime.updates.some((item) => ['tool_call', 'tool_call_update'].includes(item.sessionUpdate) && item.status === 'completed')).toBe(true);
    expect(errors).toEqual([]);
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'work-live-workspace.png') });
    succeeded = true;
    console.log(JSON.stringify({ result: 'Real selected-device ASR, reviewed task, existing-session background tool and response, and native completion speech passed', response: receipt.job.text, permissionPrompts: receipt.permissions.length, notificationWarning: receipt.job.notificationWarning ?? null }));
  } finally {
    await mkdir(output, { recursive: true });
    if (application) {
      receipt.runtime ??= await application.evaluate(() => globalThis.__workEvidence).catch((error) => ({ evidenceError: error.message }));
      receipt.job ??= await application.evaluate(async ({ app }) => {
        const fs = process.getBuiltinModule('node:fs/promises');
        try { return JSON.parse(await fs.readFile(process.getBuiltinModule('node:path').join(app.getPath('userData'), 'work-receipt.json'), 'utf8')).job; }
        catch (error) { return { evidenceError: error.message }; }
      }).catch((error) => ({ evidenceError: error.message }));
    }
    receipt.succeeded = succeeded; receipt.finishedAt = new Date().toISOString();
    await writeFile(path.join(output, 'work-live-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    await application?.close();
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
