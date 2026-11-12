const { test, expect, _electron } = require('@playwright/test');
const path = require('node:path');
const { mkdtemp, rm, writeFile, readFile } = require('node:fs/promises');
const os = require('node:os');
const { syntheticTone } = require('../helpers/synthetic-audio.cjs');

let application;
let page;
let profile;
let errors;
let meshFile;

async function settings(tab) {
  await page.getByRole('tablist', { name: 'Workspace settings', exact: true }).getByRole('tab', { name: tab, exact: true }).click();
}

async function voiceTab(tab) {
  await settings('Voice');
  await page.getByRole('tablist', { name: 'Speaking voice categories' }).getByRole('tab', { name: tab, exact: true }).click();
}

function testMesh(name = 'Test Context') {
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    contexts: [{ id: 'ctx-test', name, basePath: process.cwd() },
      { id: 'ctx-other', name: 'Alternate Context', basePath: os.tmpdir() }],
    graph: {
      nodes: [{ id: 'ctx-test', type: 'context' }, { id: 'ctx-other', type: 'context' }],
      edges: [{ source: 'ctx-test', target: 'ctx-other', type: 'cross-reference', confidence: 'high', relationshipClass: 'structural' }],
    },
  };
}

async function nodePoint(slot, capacity = 2) {
  const THREE = await import('three');
  const bounds = await page.locator('canvas[role="img"]').boundingBox();
  const y = 1 - 2 * (slot + 0.5) / capacity;
  const radius = Math.sqrt(1 - y * y);
  const theta = slot * Math.PI * (3 - Math.sqrt(5));
  const point = new THREE.Vector3(Math.cos(theta) * radius * 2.45, y * 2.45, Math.sin(theta) * radius * 2.45);
  point.applyEuler(new THREE.Euler(0.12, -0.5, 0.12));
  const camera = new THREE.PerspectiveCamera(42, bounds.width / bounds.height, 0.01, 100);
  camera.position.set(0, 0.3, 8.6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  point.project(camera);
  return { x: bounds.x + (point.x + 1) * bounds.width / 2, y: bounds.y + (1 - point.y) * bounds.height / 2 };
}

test.beforeEach(async () => {
  profile = await mkdtemp(path.join(os.tmpdir(), 'intercom-test-'));
  await writeFile(path.join(profile, 'recognition-settings.json'), JSON.stringify({ version: 1, engine: 'windows' }));
  const fakeAudio = path.join(profile, 'synthetic-tone.wav');
  await writeFile(fakeAudio, syntheticTone());
  meshFile = path.join(profile, 'context-index.json');
  await writeFile(meshFile, JSON.stringify(testMesh()));
  errors = [];
  const executablePath = process.env.INTERCOM_TEST_EXECUTABLE;
  application = await _electron.launch({
    executablePath,
    args: [...(executablePath ? [] : [path.join(__dirname, '..', '..')]), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeAudio}`],
    env: { ...process.env, INTERCOM_PROFILE_DIR: profile, INTERCOM_CONTEXT_MESH_PATH: meshFile },
  });
  page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
  await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH');
  await settings('Advanced');
  await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
});

test.afterEach(async () => {
  await application?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  expect(errors).toEqual([]);
});

test('a broken explicit speech engine preserves the draft and refuses recording before opening any microphone', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep this unsent draft.');
  await writeFile(path.join(profile, 'recognition-settings.json'), JSON.stringify({
    version: 1, engine: 'whisper', backend: 'vulkan', root: path.join(profile, 'missing-custom-engine'),
  }));
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('The microphone must not be opened before setup.'); };
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Local multilingual recognition is not ready');
  const snapshot = JSON.parse(await readFile(path.join(profile, 'diagnostics', 'last-failure.json'), 'utf8'));
  expect(snapshot.operation).toBe('voice:recognition-ready');
  expect(snapshot.error.code).toBe('ENOENT');
  const log = await readFile(path.join(profile, 'diagnostics', 'events.jsonl'), 'utf8');
  expect(log).not.toContain('Keep this unsent draft.');
  expect(log).toContain('"phase":"setup"');
  await settings('Advanced');
  await page.getByText('Local diagnostics', { exact: true }).click();
  await expect(page.getByLabel('Diagnostics directory')).toHaveText(path.join(profile, 'diagnostics'));
  await expect(page.getByRole('button', { name: 'Open diagnostics folder', exact: true })).toBeVisible();
  await settings('Talk');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep this unsent draft.');
  await settings('Input');
  await page.getByRole('tab', { name: 'Recognition', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose local Whisper engine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use legacy English recognition', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Legacy Windows English (US)' })).toBeVisible();
  await expectSettingsFit();
});

test('diagnostic storage failure stays visible and preserves the unsent draft', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep this private unsent draft.');
  const directory = path.join(profile, 'diagnostics');
  await rm(directory, { recursive: true, force: true });
  await writeFile(directory, 'Controlled storage failure.');
  await page.evaluate(() => window.intercom.recognitionReady(crypto.randomUUID()));
  await expect(page.getByRole('alert').filter({ hasText: 'Diagnostic persistence failed' })).toContainText(directory);
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep this private unsent draft.');
  expect((await page.evaluate(() => window.intercom.diagnosticsStatus())).error).toContain('Diagnostic persistence failed');
});

test('minimal glass settings fit their categories, retain drafts and support keyboard tabs', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
  await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([960, 680]);
  await expect(page.getByLabel('Transcript / typed fallback')).toBeVisible();
  await expect(page.getByLabel('Microphone device', { exact: true })).toBeHidden();
  await expect(page.getByLabel('Processing priority', { exact: true })).toBeHidden();
  expect(await page.locator('.record-button').innerText()).toBe('');
  expect(await page.locator('.voice-surface').evaluate((element) => [...element.querySelectorAll('p,span')].every((item) => item.closest('.sr-only, [aria-hidden="true"]')))).toBe(true);
  await expectReachableCenteredMicrophone();
  const tabs = page.getByRole('tablist', { name: 'Workspace settings', exact: true });
  await tabs.getByRole('tab', { name: 'Talk', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Input', exact: true })).toBeFocused();
  await expect(page.getByLabel('Microphone device', { exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Advanced', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const tab of ['Input', 'Session', 'Voice', 'Advanced']) {
    await settings(tab);
    if (tab === 'Voice') {
      await expect(page.getByLabel('Speaking voice / accent')).toBeVisible();
      for (const category of ['Voice', 'Tune', 'Profiles', 'Preview']) {
        await voiceTab(category);
        if (category === 'Profiles') await page.getByLabel('Voice profile name', { exact: true }).fill('Unpublished draft');
        await expectSettingsFit();
        await page.screenshot({ path: test.info().outputPath(`glass-voice-${category.toLowerCase()}.png`) });
      }
    } else await expectSettingsFit();
  }
  for (const category of ['Display', 'About']) {
    await page.getByRole('tablist', { name: 'Advanced categories' }).getByRole('tab', { name: category, exact: true }).click();
    if (category === 'About') await page.getByText('Prototype coverage', { exact: true }).click();
    await expectSettingsFit();
  }
  await voiceTab('Profiles');
  await expect(page.getByLabel('Voice profile name', { exact: true })).toHaveValue('Unpublished draft');
  await settings('Session');
  await page.getByLabel('Voice request destination').selectOption('chat');
  await page.getByLabel('Existing session ID', { exact: true }).fill('11111111-1111-4111-8111-111111111111');
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep this draft.');
  await settings('Input');
  await settings('Talk');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep this draft.');
  await settings('Session');
  await expect(page.getByLabel('Existing session ID', { exact: true })).toHaveValue('11111111-1111-4111-8111-111111111111');
  await settings('Work');
  for (const step of ['Plans', 'Target', 'Task', 'Review', 'Receipt']) {
    await page.getByRole('tablist', { name: 'Work steps' }).getByRole('tab', { name: step, exact: true }).click();
    await expectSettingsFit();
  }
  await settings('Talk');
  await page.screenshot({ path: test.info().outputPath('glass-workspace-minimum.png') });
});

async function expectSettingsFit() {
  const result = await page.locator('.settings-content').evaluate((element) => {
    const pane = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll('button,input,textarea,select')].filter((control) => control.checkVisibility());
    return {
      horizontal: element.scrollWidth > element.clientWidth,
      vertical: element.scrollHeight > element.clientHeight,
      visible: controls.every((control) => {
        const box = control.getBoundingClientRect();
        return box.x >= pane.x && box.right <= pane.right + 1 && box.y >= pane.y && box.bottom <= innerHeight - 88;
      }),
    };
  });
  expect(result, JSON.stringify(await page.locator('.settings-content').evaluate((element) => ({
    tab: element.dataset.settingsTab, height: element.clientHeight, scroll: element.scrollHeight, text: element.innerText,
  })))).toEqual({ horizontal: false, vertical: false, visible: true });
}

test('real snapshot reloads on process launch, reports provenance and never substitutes fixture data on errors', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await expect(page.getByRole('img', { name: /Actual local Context Mesh: 2 contexts and 1 evidence-backed relationships/ })).toBeVisible();
  await expect(page.getByLabel('Actual Context Mesh contexts')).toContainText('Test Context');
  await page.getByLabel('Find context', { exact: true }).fill('Alternate');
  await expect(page.locator('.context-row')).toHaveCount(1);
  await application.close();
  await writeFile(meshFile, JSON.stringify(testMesh('Changed on next launch')));
  const executablePath = process.env.INTERCOM_TEST_EXECUTABLE;
  application = await _electron.launch({
    executablePath, args: executablePath ? [] : [path.join(__dirname, '..', '..')],
    env: { ...process.env, INTERCOM_PROFILE_DIR: profile, INTERCOM_CONTEXT_MESH_PATH: meshFile },
  });
  page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH');
  await expect(page.getByLabel('Actual Context Mesh contexts')).toContainText('Changed on next launch');
  await page.getByText('Snapshot provenance', { exact: true }).click();
  await expect(page.locator('.sidebar-note')).toContainText(meshFile);
  const stale = testMesh(); stale.generatedAt = '2020-01-01T00:00:00Z';
  await writeFile(meshFile, JSON.stringify(stale));
  await page.getByRole('button', { name: 'Reload local mesh', exact: true }).click();
  await expect(page.locator('.sidebar-note [role="status"]')).toContainText('over 24 hours old');
  await writeFile(meshFile, '{malformed');
  await page.getByRole('button', { name: 'Reload local mesh', exact: true }).click();
  await expect(page.locator('.fixture-badge')).toHaveText('MESH UNAVAILABLE');
  await expect(page.locator('.mesh-error')).toBeVisible();
  await expect(page.locator('.context-row')).toHaveCount(0);
  await settings('Advanced');
  await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
  await expect(page.locator('.fixture-badge')).toHaveText('FIXTURE DATA');
  await expect(page.locator('.context-row')).toHaveCount(6);
});

test('real work UI binds confirmation, keeps voice and floating available during approval, and announces live completion only', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }, workspace) => {
    const id = '11111111-1111-4111-8111-111111111111';
    globalThis.__workUI = { proposals: [], approvals: [], speech: [], job: null };
    for (const action of ['state', 'sessions', 'prepare', 'confirm', 'approve', 'acknowledge']) ipcMain.removeHandler(`work:${action}`);
    ipcMain.removeHandler('voice:speak');
    ipcMain.handle('voice:speak', (_event, text) => { globalThis.__workUI.speech.push(text); });
    ipcMain.handle('work:state', () => globalThis.__workUI.job);
    ipcMain.handle('work:sessions', () => [{ id, status: 'idle' }, { id: '22222222-2222-4222-8222-222222222222', status: 'busy' }]);
    ipcMain.handle('work:prepare', (_event, contextId, sessionId, request, mode, processing) => {
      const proposal = { id, contextId, sessionId, request, mode, profile: processing, contextName: 'Test Context', workspace, expiresAt: Date.now() + 300000 };
      globalThis.__workUI.proposals.push(proposal); return proposal;
    });
    ipcMain.handle('work:confirm', (event, proposalId) => {
      const proposal = globalThis.__workUI.proposals.at(-1);
      if (proposal.id !== proposalId) throw new Error('Stale proposal');
      const job = { ...proposal, phase: 'awaiting-approval', text: '', activity: 'Get-Location', observedContextIds: ['ctx-test'], acknowledged: false,
        startedAt: new Date().toISOString(), permission: { id: '8', details: '{"command":"Get-Location"}',
          options: [{ optionId: 'yes', kind: 'allow_once', name: 'Yes' }, { optionId: 'no', kind: 'reject_once', name: 'No' }] } };
      globalThis.__workUI.job = job; event.sender.send('work:progress', job); return job;
    });
    ipcMain.handle('work:approve', (event, jobId, permissionId, optionId) => {
      globalThis.__workUI.approvals.push({ jobId, permissionId, optionId });
      const job = globalThis.__workUI.job;
      job.phase = 'responded'; job.permission = null; job.text = 'Hello world.'; job.completedAt = new Date().toISOString();
      event.sender.send('work:progress', job);
    });
    ipcMain.handle('work:acknowledge', (event) => {
      globalThis.__workUI.job.acknowledged = true; event.sender.send('work:progress', globalThis.__workUI.job);
    });
  }, process.cwd());
  await settings('Work');
  await page.getByRole('tab', { name: 'Target', exact: true }).click();
  await page.getByLabel('Target context', { exact: true }).selectOption('ctx-test');
  await page.getByRole('button', { name: 'Find existing sessions', exact: true }).click();
  await expect(page.getByLabel('Choose an existing session').locator('option[value="22222222-2222-4222-8222-222222222222"]')).toBeDisabled();
  await page.getByLabel('Choose an existing session').selectOption('11111111-1111-4111-8111-111111111111');
  await page.getByRole('tab', { name: 'Task', exact: true }).click();
  await page.getByLabel('Confirmed task', { exact: true }).fill('Run Get-Location and say hello world.');
  await page.getByRole('button', { name: 'Review target and task', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Real work confirmation' })).toContainText('allow-all OFF');
  await expect(page.locator('.real-job')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm this target and task', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Copilot tool permission' })).toContainText('Get-Location');
  await settings('Session');
  await page.getByLabel('Voice request destination').selectOption('background');
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await page.keyboard.press('Escape');
  await settings('Work');
  await expect(page.getByRole('region', { name: 'Copilot tool permission' })).toBeVisible();
  await page.getByRole('button', { name: 'Allow this operation once', exact: true }).click();
  await expect(page.locator('.real-job')).toContainText('Hello world.');
  expect(await application.evaluate(() => globalThis.__workUI.approvals)).toEqual([
    { jobId: '11111111-1111-4111-8111-111111111111', permissionId: '8', optionId: 'yes' },
  ]);
  await expect.poll(() => application.evaluate(() => globalThis.__workUI.speech.length)).toBe(1);
  await page.reload();
  await settings('Work');
  await expect(page.locator('.real-job')).toContainText('Hello world.');
  await page.waitForTimeout(100);
  expect(await application.evaluate(() => globalThis.__workUI.speech.length)).toBe(1);
  await page.getByRole('button', { name: 'Acknowledge receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Acknowledge receipt', exact: true })).toHaveCount(0);
});

test('default Intercom routing needs no designated session or second confirmation and preserves exact tool approvals', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }, workspace) => {
    globalThis.__plansUI = { requests: [], approvals: [], acknowledged: [], speech: [] };
    ipcMain.removeHandler('voice:speak');
    ipcMain.handle('voice:speak', (_event, text) => { globalThis.__plansUI.speech.push(text); });
    for (const action of ['request', 'approve', 'acknowledge', 'state']) ipcMain.removeHandler(`orchestration:${action}`);
    ipcMain.handle('orchestration:state', () => ({ plans: globalThis.__plansUI.plan ? [globalThis.__plansUI.plan] : [] }));
    ipcMain.handle('orchestration:request', (event, ...args) => {
      globalThis.__plansUI.requests.push(args);
      const [id, , processing] = args;
      const sessionId = '11111111-1111-4111-8111-111111111111';
      const interpretation = { version: 1, intent: 'plan', normalizedText: 'Refresh Fictional X.',
        message: 'Refresh Fictional X in its existing session.', excludedStatusSessionIds: [],
        actions: [{ id: 'refresh-x', kind: 'work', sessionId, request: 'Refresh context.', after: [] }] };
      const job = { id: '22222222-2222-4222-8222-222222222222', sessionId, contextId: 'ctx-test',
        contextName: 'Test Context', workspace, request: 'Refresh context.', mode: 'background', profile: processing,
        phase: 'awaiting-approval', activity: 'Fixture operation awaiting manual permission.', text: '',
        observedContextIds: [], acknowledged: false, startedAt: new Date().toISOString(),
        permission: { id: 'fixture-permission', details: '{"command":"fixture-only-operation"}',
          options: [{ optionId: 'yes', kind: 'allow_once', name: 'Yes' }, { optionId: 'no', kind: 'reject_once', name: 'No' }] } };
      const plan = { id, profile: processing, interpretation,
        targets: [{ id: sessionId, name: 'Fictional X', contextId: 'ctx-test', contextName: 'Test Context', workspace }],
        createdAt: new Date().toISOString(), phase: 'active', cancelled: false, acknowledged: false,
        actions: [{ id: 'refresh-x', phase: 'awaiting-approval', job }] };
      globalThis.__plansUI.plan = plan;
      event.sender.send('orchestration:progress', { plans: [plan] });
      return { interpretation, planId: id, warnings: [] };
    });
    ipcMain.handle('orchestration:approve', (event, ...args) => {
      globalThis.__plansUI.approvals.push(args);
      const plan = globalThis.__plansUI.plan;
      plan.phase = 'finished'; plan.actions[0].phase = 'responded';
      Object.assign(plan.actions[0].job, { phase: 'responded', permission: null, text: 'Fixture response. No live agent ran.' });
      event.sender.send('orchestration:progress', { plans: [plan] });
    });
    ipcMain.handle('orchestration:acknowledge', (event, id) => {
      globalThis.__plansUI.acknowledged.push(id);
      globalThis.__plansUI.plan.acknowledged = true;
      event.sender.send('orchestration:progress', { plans: [globalThis.__plansUI.plan] });
    });
  }, process.cwd());
  await settings('Talk');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveAttribute('maxlength', '10000');
  await page.getByLabel('Transcript / typed fallback').fill('Uh, refresh Fictional X.');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await expect.poll(() => application.evaluate(() => globalThis.__plansUI.speech)).toEqual(['I am checking your request and existing sessions.']);
  const requests = await application.evaluate(() => globalThis.__plansUI.requests);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toHaveLength(3);
  expect(requests[0].slice(1)).toEqual(['Uh, refresh Fictional X.', 'Speed / performance']);
  await expect(page.getByRole('region', { name: 'Real work confirmation' })).toBeHidden();
  await settings('Talk');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Refresh Fictional X.');
  await settings('Work');
  await expect(page.getByRole('region', { name: 'Orchestrated tool permission' })).toBeVisible();
  await expect(page.getByLabel('Review the full operation before deciding')).toHaveValue('{"command":"fixture-only-operation"}');
  await expectSettingsFit();
  const details = 'Full fixture permission detail, not an executed command.\n'.repeat(1000);
  await application.evaluate(({ BrowserWindow }, text) => {
    const plan = globalThis.__plansUI.plan;
    plan.targets[0].name = 'Long fixture target name '.repeat(40);
    plan.actions[0].job.permission.details = text;
    BrowserWindow.getAllWindows()[0].webContents.send('orchestration:progress', { plans: [plan] });
  }, details);
  await expect(page.getByLabel('Review the full operation before deciding')).toHaveValue(details);
  await expectSettingsFit();
  await page.screenshot({ path: test.info().outputPath('orchestration-permission.png') });
  await page.getByRole('button', { name: 'Allow this operation once', exact: true }).click();
  const [id] = requests[0];
  expect(await application.evaluate(() => globalThis.__plansUI.approvals)).toEqual([
    [id, 'refresh-x', '22222222-2222-4222-8222-222222222222', 'fixture-permission', 'yes'],
  ]);
  await expect(page.getByText('Agent responded; task success unverified', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Result', exact: true }).click();
  await expect(page.getByLabel('Response / outcome details')).toHaveValue('Fixture response. No live agent ran.');
  await expect.poll(() => application.evaluate(() => globalThis.__plansUI.speech.length)).toBe(2);
  expect((await application.evaluate(() => globalThis.__plansUI.speech))[1]).toContain('Task success is not independently verified.');
  await expectSettingsFit();
  await page.reload();
  await settings('Work');
  await expect(page.getByRole('button', { name: 'Acknowledge this receipt', exact: true })).toBeVisible();
  expect(await application.evaluate(() => globalThis.__plansUI.speech.length)).toBe(2);
  await page.getByRole('button', { name: 'Acknowledge this receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Acknowledge this receipt', exact: true })).toBeHidden();
  expect(await application.evaluate(() => globalThis.__plansUI.acknowledged)).toEqual([id]);
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('orchestration:progress', { plans: [globalThis.__plansUI.plan] });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
  expect(await application.evaluate(() => globalThis.__plansUI.speech.length)).toBe(2);
});

test('default Intercom conversation speaks progress and replies locally while respecting voice opt-out', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }) => {
    globalThis.__replySpeech = [];
    ipcMain.removeHandler('voice:speak');
    ipcMain.handle('voice:speak', (_event, text) => { globalThis.__replySpeech.push(text); });
    ipcMain.removeHandler('orchestration:request');
    ipcMain.handle('orchestration:request', () => ({
      interpretation: { normalizedText: 'Fixture question.', message: 'Fixture reply. No session work was sent.' },
      planId: null, warnings: [],
    }));
  });
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Fixture question.');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect.poll(() => application.evaluate(() => globalThis.__replySpeech)).toEqual([
    'I am checking your request and existing sessions.', 'Fixture reply. No session work was sent.',
  ]);
  await settings('Voice');
  await page.getByRole('checkbox', { name: 'Speak progress and responses (local Windows voice)' }).uncheck();
  await settings('Talk');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  expect(await application.evaluate(() => globalThis.__replySpeech.length)).toBe(2);
});

async function prepareClarificationMock({ muted = false, intent = 'clarify', readinessError = false, speechError = false, microphoneError = false } = {}) {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }, options) => {
    globalThis.__clarification = { requests: [], ready: 0 };
    for (const channel of ['voice:speak', 'voice:stop-speech', 'voice:recognition-ready', 'voice:transcribe',
      'voice:cancel', 'orchestration:request', 'orchestration:cancel-request']) ipcMain.removeHandler(channel);
    ipcMain.handle('voice:speak', (_event, text) => {
      if (text !== 'Which project should receive this request?') return;
      if (options.speechError) throw new Error('Fixture question playback failed');
      return new Promise((resolve) => { globalThis.__clarification.finishSpeech = resolve; });
    });
    ipcMain.handle('voice:stop-speech', () => {});
    ipcMain.handle('voice:cancel', () => {});
    ipcMain.handle('orchestration:cancel-request', () => {});
    ipcMain.handle('voice:recognition-ready', () => {
      globalThis.__clarification.ready++;
      if (options.readinessError) throw new Error('Fixture engine unavailable');
    });
    ipcMain.handle('voice:transcribe', () => ({ text: 'Intercom.', reviewRequired: !!globalThis.__clarification.reviewRequired }));
    ipcMain.handle('orchestration:request', (_event, id, text) => {
      globalThis.__clarification.requests.push({ id, text });
      const clarifying = globalThis.__clarification.requests.length === 1 || globalThis.__clarification.clarifyAgain;
      return {
        interpretation: { version: 1, intent: clarifying ? options.intent : 'reply',
          normalizedText: text, message: clarifying
            ? 'Which project should receive this request?' : 'Reply received. No work was sent.',
          actions: [], excludedStatusSessionIds: [] },
        planId: null, warnings: [],
      };
    });
  }, { intent, readinessError, speechError });
  await page.evaluate((microphoneError) => {
    window.__replyTracks = [];
    window.__replyMicCalls = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__replyMicCalls++;
      if (microphoneError) throw new Error('Fixture microphone unavailable');
      const stream = await original(constraints);
      window.__replyTracks.push(...stream.getTracks());
      return stream;
    };
  }, microphoneError);
  if (muted) {
    await settings('Voice');
    await page.getByLabel('Speak progress and responses (local Windows voice)').uncheck();
  }
  await settings('Talk');
}

async function askClarification() {
  await page.getByLabel('Transcript / typed fallback').fill('Send this request to my project.');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect(page.getByText('Which project should receive this request?', { exact: true })).toBeVisible();
}

for (const input of ['typed', 'voice']) {
test(`clarification after ${input} input waits for playback and opens exactly one reply mic`, async () => {
  await prepareClarificationMock();
  if (input === 'typed') await askClarification();
  else {
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByText('Which project should receive this request?', { exact: true })).toBeVisible();
  }
  const initialCaptures = input === 'typed' ? 0 : 1;
  await expect.poll(() => application.evaluate(() => !!globalThis.__clarification.finishSpeech)).toBe(true);
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(initialCaptures);
  await application.evaluate(() => globalThis.__clarification.finishSpeech());
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await expect(page.getByText('Which project should receive this request?', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(initialCaptures + 1);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByText('Reply received. No work was sent.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
  expect(await application.evaluate(() => globalThis.__clarification.requests.map(({ text }) => text)))
    .toEqual([input === 'typed' ? 'Send this request to my project.' : 'Intercom.', 'Intercom.']);
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(initialCaptures + 1);
  expect(await page.evaluate(() => window.__replyTracks.every((track) => track.readyState === 'ended'))).toBe(true);
});
}

for (const action of ['Stop voice playback', 'Cancel request', 'Disable automatic replies', 'Hide window']) {
  test(`clarification never opens a late reply mic after ${action}`, async () => {
    await prepareClarificationMock();
    await askClarification();
    await expect.poll(() => application.evaluate(() => !!globalThis.__clarification.finishSpeech)).toBe(true);
    if (action === 'Disable automatic replies') {
      await settings('Advanced');
      await page.getByLabel('Automatically listen for clarification replies').uncheck();
    } else if (action === 'Hide window') {
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
      await expect.poll(() => page.evaluate(async () => (await window.intercom.windowAction('state')).paused)).toBe(true);
    } else await page.getByRole('button', { name: action, exact: true }).click();
    await application.evaluate(() => globalThis.__clarification.finishSpeech());
    await expect.poll(() => page.locator('.record-button').getAttribute('aria-busy')).toBe('false');
    expect(await page.evaluate(() => window.__replyMicCalls)).toBe(0);
    expect(await application.evaluate(() => globalThis.__clarification.requests.length)).toBe(1);
  });
}

test('muted clarification can capture a reply but opt-out prevents another clarification capture', async () => {
  await prepareClarificationMock({ muted: true });
  await askClarification();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(1);
  await settings('Advanced');
  await page.getByLabel('Automatically listen for clarification replies').uncheck();
  await application.evaluate(() => { globalThis.__clarification.clarifyAgain = true; });
  await settings('Talk');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect(page.getByText('Which project should receive this request?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
  expect(await application.evaluate(() => globalThis.__clarification.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(1);
});

for (const failure of ['readiness', 'playback', 'microphone']) {
  test(`clarification ${failure} failure preserves the question without opening the mic`, async () => {
    await prepareClarificationMock({ muted: failure !== 'playback', readinessError: failure === 'readiness',
      speechError: failure === 'playback', microphoneError: failure === 'microphone' });
    await askClarification();
    await expect(page.getByRole('alert').filter({ hasText: failure === 'readiness' ? 'Fixture engine unavailable'
      : failure === 'playback' ? 'Fixture question playback failed' : 'Fixture microphone unavailable' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__replyMicCalls)).toBe(failure === 'microphone' ? 1 : 0);
    expect(await application.evaluate(() => globalThis.__clarification.requests.length)).toBe(1);
  });
}

test('ordinary question-shaped replies never automatically open a microphone', async () => {
  await prepareClarificationMock({ muted: true, intent: 'reply' });
  await askClarification();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(0);
});

test('clarification opt-out during pending readiness prevents microphone access', async () => {
  await prepareClarificationMock({ muted: true });
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('voice:recognition-ready');
    ipcMain.handle('voice:recognition-ready', () => new Promise((resolve) => {
      globalThis.__clarification.finishReadiness = resolve;
    }));
  });
  await askClarification();
  await expect.poll(() => application.evaluate(() => !!globalThis.__clarification.finishReadiness)).toBe(true);
  await settings('Advanced');
  await page.getByLabel('Automatically listen for clarification replies').uncheck();
  await application.evaluate(() => globalThis.__clarification.finishReadiness());
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(0);
});

test('clarification reply with uncertain recognition stays reviewable and never auto-sends', async () => {
  await prepareClarificationMock({ muted: true });
  await application.evaluate(() => { globalThis.__clarification.reviewRequired = true; });
  await askClarification();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Nothing was sent');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Intercom.');
  expect(await application.evaluate(() => globalThis.__clarification.requests.length)).toBe(1);
  expect(await page.evaluate(() => window.__replyMicCalls)).toBe(1);
});

test('research shows a saved report and collapses live catalog diagnostics, with explicit reopen failure and recovery', async () => {
  await observeSpeechWithoutPlayback();
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }) => {
    globalThis.__reportUI = { opened: [], fail: true };
    ipcMain.removeHandler('orchestration:request');
    ipcMain.removeHandler('orchestration:open-report');
    ipcMain.handle('orchestration:request', (_event, id) => ({
      interpretation: { normalizedText: 'Find AzRetroFit session history.', message: 'A partial private report was saved. No session work was sent.' },
      planId: null, warnings: ['Mock unnamed catalog warning', 'Mock unavailable live workspace'],
      researchReport: { id, path: `C:\\private\\research\\${id}.html`, contexts: 2, filesRead: 7,
        readableHistories: 1, matchingHistories: 1, partial: true, opened: false, openError: 'Mock browser unavailable' },
    }));
    ipcMain.handle('orchestration:open-report', (_event, id) => {
      globalThis.__reportUI.opened.push(id);
      if (globalThis.__reportUI.fail) throw new Error('Mock reopen refused');
    });
  });
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Find AZ Retrofit sessions.');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect(page.getByText('A partial private report was saved. No session work was sent.')).toBeVisible();
  await expect(page.getByText('Mock unnamed catalog warning', { exact: true })).toBeHidden();
  await expect(page.getByText('Mock browser unavailable', { exact: true })).toBeVisible();
  await page.locator('.catalog-diagnostics summary').click();
  await expect(page.getByText('Mock unnamed catalog warning', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open context report', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Mock reopen refused' })).toBeVisible();
  await application.evaluate(() => { globalThis.__reportUI.fail = false; });
  await page.getByRole('button', { name: 'Open context report', exact: true }).click();
  await expect(page.getByText('Mock browser unavailable', { exact: true })).toBeHidden();
  await expect(page.getByRole('alert').filter({ hasText: 'Mock reopen refused' })).toBeHidden();
  await expect.poll(() => application.evaluate(() => globalThis.__reportUI.opened.length)).toBe(2);
  await expectSettingsFit();
});

test('real-mode source activity is attributable, finite, reduced-motion aware and usable in floating mode', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  const activity = {
    id: '11111111-1111-4111-8111-111111111111', phase: 'researching', startedAt: new Date().toISOString(),
    topic: 'Fixture research', filesRead: 0, unavailableSources: 0, observedContextIds: [],
    events: [{ sequence: 1, at: new Date().toISOString(), contextIds: ['ctx-test'], kind: 'continuity notes',
      path: 'C:\\fixture-only\\STATE.md', status: 'checking', filesRead: 0, unavailableSources: 0 }],
  };
  const send = async () => application.evaluate(({ BrowserWindow }, requestActivity) => {
    BrowserWindow.getAllWindows()[0].webContents.send('orchestration:progress', { plans: [], requestActivity });
  }, activity);
  await send();
  const panel = page.getByRole('region', { name: 'Observed context activity' });
  await expect(panel).toContainText('0 files read');
  await panel.getByText('Observed sources (1 recent events)', { exact: true }).click();
  await expect(panel).toContainText('CHECKING');
  const canvas = page.locator('canvas[role="img"]');
  await expect(canvas).toHaveAttribute('data-observed-pulse', 'false');
  activity.events.push({ ...activity.events[0], sequence: 2, at: new Date().toISOString(), status: 'read', filesRead: 1 });
  activity.observedContextIds = ['ctx-test']; activity.filesRead = 1;
  await send();
  await expect(canvas).toHaveAttribute('data-observed-access', `${activity.id}:2`);
  await expect(canvas).toHaveAttribute('data-observed-pulse', 'true');
  await expect(panel).toContainText('1 files read');
  await page.screenshot({ path: test.info().outputPath('observed-context-activity.png') });
  await expect(canvas).toHaveAttribute('data-observed-pulse', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  activity.events.push({ ...activity.events[0], sequence: 3, at: new Date().toISOString(),
    contextIds: ['ctx-other'], path: 'C:\\fixture-only\\missing.md', status: 'unavailable', filesRead: 1,
    unavailableSources: 1, error: 'Fixture source unavailable' });
  activity.unavailableSources = 1;
  await send();
  await expect(panel).toContainText('Fixture source unavailable');
  await expect(canvas).toHaveAttribute('data-observed-access', `${activity.id}:2`);
  activity.events.push({ ...activity.events[1], sequence: 4, at: new Date().toISOString(), contextIds: ['ctx-other'], filesRead: 2 });
  activity.observedContextIds.push('ctx-other'); activity.filesRead = 2;
  await send();
  await expect(canvas).toHaveAttribute('data-observed-access', `${activity.id}:4`);
  await expect(canvas).toHaveAttribute('data-observed-pulse', 'false');
  activity.phase = 'cancelled';
  await send();
  await expect(panel).toContainText('Request cancelled');
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('details')).toBeHidden();
  expect(await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
  })).toBe(true);
});

test('research synthesis requires an explicit idle session choice and queues only its report capability', async () => {
  await observeSpeechWithoutPlayback();
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }) => {
    globalThis.__synthesisUI = { queued: [] };
    for (const name of ['request', 'research-targets', 'synthesize-report']) ipcMain.removeHandler(`orchestration:${name}`);
    ipcMain.handle('orchestration:request', (_event, id) => {
      globalThis.__synthesisUI.reportId = id;
      return { interpretation: { normalizedText: 'Fixture research', message: 'Fixture report ready.' }, planId: null, warnings: [],
        researchReport: { id, path: `C:\\fixture-only\\${id}.html`, contexts: 1, filesRead: 4, readableHistories: 0,
          matchingHistories: 0, partial: false, opened: true } };
    });
    ipcMain.handle('orchestration:research-targets', () => ({ warnings: [], sessions: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'Fixture idle', contextName: 'Fixture', status: 'idle' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Fixture busy', contextName: 'Fixture', status: 'busy' },
    ] }));
    ipcMain.handle('orchestration:synthesize-report', (_event, ...args) => { globalThis.__synthesisUI.queued.push(args); return { planId: args[0] }; });
  });
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Collect fixture research.');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await page.getByRole('button', { name: 'Choose synthesis session', exact: true }).click();
  const selected = page.getByLabel('Existing synthesis session', { exact: true });
  await expect(selected).toHaveValue('');
  const queue = page.getByRole('button', { name: 'Synthesize with selected Copilot session', exact: true });
  await expect(queue).toBeDisabled();
  await expect(selected.locator('option[value="33333333-3333-4333-8333-333333333333"]')).toBeDisabled();
  await selected.selectOption('22222222-2222-4222-8222-222222222222');
  await queue.click();
  await expect(page.getByRole('tab', { name: 'Work', exact: true })).toHaveAttribute('aria-selected', 'true');
  const result = await application.evaluate(() => globalThis.__synthesisUI);
  expect(result.queued).toHaveLength(1);
  expect(result.queued[0].slice(1)).toEqual([result.reportId, '22222222-2222-4222-8222-222222222222', 'Speed / performance']);
});

test('cancelling default interpretation preserves the request and ignores a late controller response', async () => {
  await observeSpeechWithoutPlayback();
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await application.evaluate(({ ipcMain }) => {
    globalThis.__interpretationUI = { ids: [], cancelled: [] };
    ipcMain.removeHandler('orchestration:request');
    ipcMain.removeHandler('orchestration:cancel-request');
    ipcMain.handle('orchestration:request', (_event, id) => {
      globalThis.__interpretationUI.ids.push(id);
      return new Promise((resolve) => { globalThis.__interpretationUI.resolve = resolve; });
    });
    ipcMain.handle('orchestration:cancel-request', (_event, id) => {
      globalThis.__interpretationUI.cancelled.push(id);
      globalThis.__interpretationUI.resolve({
        interpretation: { normalizedText: 'Must not replace the cancelled draft.', message: 'Late answer must not appear.' },
        planId: null, warnings: [],
      });
    });
  });
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep this cancelled request.');
  await page.getByRole('button', { name: 'Send to Intercom', exact: true }).click();
  await expect.poll(() => application.evaluate(() => globalThis.__interpretationUI.ids.length)).toBe(1);
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep this cancelled request.');
  await expect(page.getByText('Late answer must not appear.', { exact: true })).toBeHidden();
  expect(await application.evaluate(() => globalThis.__interpretationUI.cancelled)).toEqual(
    await application.evaluate(() => globalThis.__interpretationUI.ids));
});

test('real desktop transparency, reversible floating controls and narrow IPC', async () => {
  const logo = page.getByRole('img', { name: 'Intercom logo', exact: true });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate(async (image) => {
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  })).toEqual([256, 256]);
  expect(await page.locator('link[rel="icon"]').evaluate(async (link) => {
    const image = new Image();
    image.src = link.href;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  })).toBe(true);
  await expect(page.locator('canvas[role="img"]')).toBeVisible();
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
  await expect(page.locator('.titlebar .brand-logo')).toBeHidden();
  expect(await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('canvas[role="img"]').evaluate((canvas) => canvas.getContext('webgl2').getContextAttributes().alpha)).toBe(true);
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
  await expect(page.getByRole('button', { name: 'Expand floating controls', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  await page.getByRole('button', { name: 'Always on top' }).click();
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(bounds);
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
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

test('window maximize and restore track native events and survive floating mode', async () => {
  const normalBounds = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  await page.getByRole('button', { name: 'Maximize window', exact: true }).click();
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await expect(page.locator('main')).toHaveAttribute('data-maximized', 'true');
  await page.getByRole('button', { name: 'Restore window', exact: true }).click();
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(normalBounds);
  await expect(page.locator('main')).toHaveAttribute('data-maximized', 'false');

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await expect(page.getByRole('button', { name: 'Restore window', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width)).toBeLessThanOrEqual(540);
  expect(await page.evaluate(async () => {
    try { await window.intercom.windowAction('toggle-maximize'); return false; }
    catch (error) { return error.message.includes('Restore the workspace'); }
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await page.getByRole('button', { name: 'Restore window', exact: true }).click();
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(normalBounds);
  await page.screenshot({ path: test.info().outputPath('workspace-window-controls.png') });
});

test('floating dock starts collapsed, fits every control without scrolling at minimum size and preserves graph controls', async () => {
  const normalBounds = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  expect(await page.evaluate(async () => {
    try { await window.intercom.windowAction('grow-floating'); return false; }
    catch (error) { return error.message.includes('Switch to Floating Mesh'); }
  })).toBe(true);
  await page.getByRole('button', { name: 'Zoom in graph', exact: true }).click();
  await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('125%');
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await page.mouse.move(1, 1);
  const handle = page.getByLabel('Move floating mesh', { exact: true });
  const smaller = page.getByRole('button', { name: 'Make floating window smaller', exact: true });
  const larger = page.getByRole('button', { name: 'Make floating window larger', exact: true });
  const size = page.getByLabel('Floating window size', { exact: true });
  await expect(handle).toBeVisible();
  await expect(handle).toHaveText('Drag to move');
  expect(await handle.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag');
  await expect(smaller).toBeHidden();
  await expect(page.getByRole('button', { name: 'Zoom in graph', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  await expect(smaller).toBeVisible();
  await expect(larger).toBeVisible();
  expect(await page.locator('.floating-tools').evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  await expect(size).toHaveText('540px');
  await page.screenshot({ path: test.info().outputPath('floating-move-size.png'), omitBackground: true });

  await larger.click();
  await expect(size).toHaveText('588px');
  expect(await application.evaluate(({ BrowserWindow }) => {
    const { width, height } = BrowserWindow.getAllWindows()[0].getBounds();
    return [width, height];
  })).toEqual([588, 588]);
  await smaller.click();
  await expect(size).toHaveText('540px');
  for (let count = 0; count < 4; count++) await smaller.click();
  await expect(size).toHaveText('360px');
  await expect(smaller).toBeDisabled();
  await expect(larger).toBeEnabled();
  const smallLayout = await page.locator('.floating-tools').boundingBox();
  expect(smallLayout.x).toBeGreaterThanOrEqual(0);
  expect(smallLayout.x + smallLayout.width).toBeLessThanOrEqual(360);
  expect(smallLayout.height).toBeLessThan(160);
  const row = await page.locator('.floating-dock-controls').evaluate((element) => ({
    overflowing: element.scrollWidth > element.clientWidth,
    vertical: element.scrollHeight > element.clientHeight,
    reachable: [...element.querySelectorAll('button,output')].every((control) => {
      const box = control.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight && control.contains(hit);
    }),
  }));
  expect(row, JSON.stringify(await page.locator('.floating-dock-controls').evaluate((element) => ({
    width: element.clientWidth, scroll: element.scrollWidth,
    children: [...element.children].map((child) => ({ name: child.getAttribute('aria-label') ?? child.className, width: child.clientWidth, scroll: child.scrollWidth })),
  })))).toEqual({ overflowing: false, vertical: false, reachable: true });
  await page.screenshot({ path: test.info().outputPath('floating-move-size-minimum.png'), omitBackground: true });
  expect(await page.evaluate(async () => (await window.intercom.windowAction('shrink-floating')).floatingSize.side)).toBe(360);

  const maximum = await page.evaluate(async () => {
    const { min, max } = (await window.intercom.windowAction('state')).floatingSize;
    for (let count = 0; count < Math.ceil((max - min) / 48) + 2; count++) {
      await window.intercom.windowAction('grow-floating');
    }
    return max;
  });
  await expect(size).toHaveText(`${maximum}px`);
  await expect(larger).toBeDisabled();
  const geometry = await application.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0].getBounds();
    return { bounds, area: screen.getDisplayMatching(bounds).workArea };
  });
  expect(geometry.bounds.width).toBe(maximum);
  expect(geometry.bounds.height).toBe(maximum);
  expect(geometry.bounds.x).toBeGreaterThanOrEqual(geometry.area.x);
  expect(geometry.bounds.y).toBeGreaterThanOrEqual(geometry.area.y);
  expect(geometry.bounds.x + maximum).toBeLessThanOrEqual(geometry.area.x + geometry.area.width);
  expect(geometry.bounds.y + maximum).toBeLessThanOrEqual(geometry.area.y + geometry.area.height);
  await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('125%');
  await page.getByRole('button', { name: 'Restore workspace', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(normalBounds);
  await expect(page.getByLabel('Graph zoom', { exact: true })).toHaveText('125%');
});

test('graph zoom enters the sphere, supports cursor zoom and pan, and resets the view', async () => {
  const canvas = page.locator('canvas[role="img"]');
  const zoom = page.getByLabel('Graph zoom', { exact: true });
  await expect(zoom).toHaveText('100%');
  const initial = await canvas.screenshot();
  for (let count = 0; count < 10; count++) await page.getByRole('button', { name: 'Zoom in graph', exact: true }).click();
  expect(parseInt(await zoom.textContent(), 10)).toBeGreaterThan(800);
  expect(await canvas.screenshot()).not.toEqual(initial);
  await page.getByRole('button', { name: 'Zoom out graph', exact: true }).click();
  expect(parseInt(await zoom.textContent(), 10)).toBeLessThan(900);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(zoom).toHaveText('100%');

  const bounds = await canvas.boundingBox();
  const x = bounds.x + bounds.width * 0.4;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -1800);
  await expect.poll(async () => parseInt(await zoom.textContent(), 10)).toBeGreaterThan(200);
  const beforePan = await canvas.screenshot();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 75, y + 40, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  expect(await canvas.screenshot()).not.toEqual(beforePan);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(zoom).toHaveText('100%');
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in graph', exact: true }).focus();
  await page.getByRole('button', { name: 'Zoom in graph', exact: true }).click();
  await expect(zoom).toHaveText('125%');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(zoom).toHaveText('100%');
});

test('mesh nodes reveal names on hover and pin independently of the work target, not on orbit drags', async () => {
  const decorative = await nodePoint(0, 144);
  await page.mouse.move(decorative.x, decorative.y);
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  const canvas = page.locator('canvas[role="img"]');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
  const selected = await page.locator('.context-row.selected').textContent();
  const point = await nodePoint(1);
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole('tooltip')).toContainText('Test Context');
  await page.getByLabel('Find context', { exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.mouse.click(point.x, point.y);
  const details = page.getByRole('region', { name: 'Pinned node details' });
  await expect(details).toContainText('Test Context');
  await expect(details).toContainText(process.cwd());
  expect(await page.locator('.context-row.selected').textContent()).toBe(selected);
  const before = await details.boundingBox();
  await page.getByRole('button', { name: 'Zoom in graph', exact: true }).click();
  await expect.poll(async () => (await details.boundingBox()).x).not.toBe(before.x);
  await page.getByRole('button', { name: 'Close node label', exact: true }).click();
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const reset = await nodePoint(1);
  await page.mouse.move(reset.x, reset.y);
  await page.mouse.down();
  await page.mouse.move(reset.x + 65, reset.y + 35, { steps: 5 });
  await page.mouse.up();
  await expect(details).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const first = await nodePoint(0);
  await page.mouse.click(first.x, first.y);
  await expect(details).toContainText('Alternate Context');
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + 15, bounds.y + bounds.height - 15);
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.getByRole('tooltip')).toContainText('Voice assistant hub');
});

test('keyboard node inspection fits the smallest floating view and Escape dismisses before restoring', async () => {
  await page.evaluate(() => {
    window.__speechStops = 0;
    const cancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel = () => { window.__speechStops++; cancel(); };
  });
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  const canvas = page.locator('canvas[role="img"]');
  await canvas.focus();
  await expect(page.getByRole('tooltip')).toContainText('Alternate Context');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tooltip')).toContainText('Test Context');
  await page.keyboard.press('Enter');
  const details = page.getByRole('region', { name: 'Pinned node details' });
  await expect(details).toContainText('Test Context');
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  for (let count = 0; count < 4; count++) await page.getByRole('button', { name: 'Make floating window smaller', exact: true }).click();
  await expect(details).toBeVisible();
  await expect.poll(async () => {
    const graph = await canvas.boundingBox();
    const label = await details.boundingBox();
    return label.x >= graph.x && label.y >= graph.y && label.x + label.width <= graph.x + graph.width
      && label.y + label.height <= graph.y + graph.height;
  }).toBe(true);
  const graph = await canvas.boundingBox();
  const anchor = await nodePoint(1);
  await expect.poll(async () => {
    const label = await details.boundingBox();
    const expected = graph.y + Math.max(8, Math.min(anchor.y - graph.y - label.height - 12, graph.height - label.height - 8));
    return Math.abs(label.y - expected);
  }).toBeLessThan(1);
  await page.screenshot({ path: path.join(__dirname, '..', '..', '.local', 'node-inspection-floating.png') });
  const speechStops = await page.evaluate(() => window.__speechStops);
  await page.keyboard.press('Escape');
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  expect(await page.evaluate(() => window.__speechStops)).toBeGreaterThan(speechStops);
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  await canvas.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tooltip')).toContainText('Voice assistant hub');
  await page.keyboard.press('Space');
  await expect(details).toContainText('Intercom');
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
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
  await settings('Advanced');
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
  await page.locator('canvas[role="img"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Pinned node details' })).toBeVisible();
  await page.locator('canvas[role="img"]').evaluate((canvas) => {
    const context = canvas.getContext('webgl2');
    context.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('3D graphics context was lost');
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.mesh-node-label')).toHaveCount(0);
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
  await expect(page.locator('canvas[role="img"]')).toBeVisible();
  await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH');
  await expect.poll(async () => {
    const before = await page.evaluate(() => window.__frameRequests);
    await page.waitForTimeout(250);
    return (await page.evaluate(() => window.__frameRequests)) - before;
  }).toBe(0);
  const idle = await page.evaluate(() => window.__frameRequests);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__frameRequests)).toBe(idle);
  await page.locator('canvas[role="img"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const details = page.getByRole('region', { name: 'Pinned node details' });
  await expect(details).toBeVisible();
  await page.waitForTimeout(100);
  const pinnedIdle = await page.evaluate(() => window.__frameRequests);
  const anchor = await details.boundingBox();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__frameRequests)).toBe(pinnedIdle);
  await settings('Advanced');
  await page.getByRole('tab', { name: 'Display', exact: true }).click();
  await page.getByRole('button', { name: 'Enable drift' }).click();
  await expect.poll(() => page.evaluate(() => window.__frameRequests)).toBeGreaterThan(pinnedIdle + 2);
  await expect.poll(async () => (await details.boundingBox()).x).not.toBe(anchor.x);
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
  await expect(microphone.getByRole('status')).toContainText('Selected microphone opens successfully.');
  expect(await page.evaluate(() => window.__microphoneRequests.at(-1))).toEqual({
    audio: { deviceId: { exact: device }, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false,
  });
  await expect(page.getByLabel('Microphone diagnostics')).toContainText('Recognition: 16000 Hz, mono PCM16.');
  await expect(page.getByLabel('Microphone diagnostics')).not.toContainText('Peak 0.0%');
  expect(await page.evaluate(() => window.__microphoneTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      return 'unexpected grant';
    } catch (reason) { return reason.name; }
  })).toBe('NotAllowedError');
  await page.reload();
  await settings('Advanced');
  await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
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

  async function prepareVoiceMock({ delayed = false, recognitionError = false, connect = true,
    recognition = { text: 'Say hello world.', confidence: 0.9, reviewRequired: false } } = {}) {
    await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
    await application.evaluate(({ ipcMain }, options) => {
      globalThis.__voiceReceipt = { sent: [], recordings: [], cancelled: [] };
      for (const action of ['configure', 'transcribe', 'send', 'cancel', 'speak', 'stop-speech']) ipcMain.removeHandler(`voice:${action}`);
      ipcMain.handle('voice:configure', (_event, id, sessionId) => ({ sessionId, workspace: process.cwd(), id }));
      ipcMain.handle('voice:transcribe', (_event, id, buffer) => {
        if (options.recognitionError) throw new Error('No English speech was recognized.');
        const view = new DataView(buffer);
        globalThis.__voiceReceipt.recordings.push({ id, bytes: buffer.byteLength, rate: view.getUint32(24, true), pcm: view.getUint16(20, true) });
        return options.recognition;
      });
      ipcMain.handle('voice:send', (event, id, text) => {
        globalThis.__voiceReceipt.sent.push({ id, text });
        event.sender.send('voice:progress', { requestId: id, phase: 'running', message: 'Copilot running' });
        if (options.delayed) return new Promise((resolve) => { globalThis.__resolveVoice = () => resolve({ requestId: id, text: 'Late response must not appear' }); });
        return { requestId: id, sessionId: '11111111-1111-4111-8111-111111111111', text: 'Hello world.' };
      });
      ipcMain.handle('voice:cancel', (_event, id) => { globalThis.__voiceReceipt.cancelled.push(id); });
      ipcMain.handle('voice:speak', () => {});
      ipcMain.handle('voice:stop-speech', () => {});
    }, { delayed, recognitionError, recognition });
    await settings('Voice');
    await page.getByLabel('Speak progress and responses (local Windows voice)').uncheck();
    await settings('Session');
    await page.getByLabel('Voice request destination').selectOption('chat');
    if (connect) {
      await settings('Session');
      await page.getByLabel('Existing session ID', { exact: true }).fill('11111111-1111-4111-8111-111111111111');
      await page.getByRole('button', { name: 'Connect existing session', exact: true }).click();
      await expect(page.getByText('Session connected - settings', { exact: true })).toBeVisible();
    }
    await settings('Input');
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  }

async function expectReachableCenteredMicrophone() {
  const mic = page.locator('.record-button');
  await expect(mic).toBeInViewport({ ratio: 1 });
  await mic.click({ trial: true });
  const placement = await mic.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    return { centerOffset: Math.abs(x - innerWidth / 2), hit: button.contains(document.elementFromPoint(x, y)), y };
  });
  if (await page.locator('main').getAttribute('data-floating') !== 'true') expect(placement.centerOffset).toBeLessThanOrEqual(1);
  expect(placement.hit).toBe(true);
  return placement;
}

test('workspace microphone stays centered and clickable while panels scroll, settings open and the window resizes or maximizes', async () => {
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await expect(page.locator('.voice-setup')).toBeHidden();
  await expect(page.locator('.voice-playback')).toBeHidden();
  await expect(page.getByLabel('Transcript / typed fallback')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('workspace-microphone-default.png') });
  for (const [width, height] of [[1240, 820], [960, 680]]) {
    await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
    const initial = await expectReachableCenteredMicrophone();
    await page.locator('.settings-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await expectReachableCenteredMicrophone()).y).toBe(initial.y);
    await page.getByRole('button', { name: 'Voice settings and transcript', exact: true }).click();
    await expect(page.getByLabel('Microphone device', { exact: true })).toBeInViewport();
    expect((await expectReachableCenteredMicrophone()).y).toBe(initial.y);
    const footer = await page.locator('.voice-surface').boundingBox();
    const graph = await page.locator('.center').boundingBox();
    expect(graph.y + graph.height).toBeLessThanOrEqual(footer.y);
    await page.screenshot({ path: test.info().outputPath(`workspace-microphone-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Maximize window', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-maximized', 'true');
  await expectReachableCenteredMicrophone();
  await page.getByRole('button', { name: 'Restore window', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-maximized', 'false');
  await expectReachableCenteredMicrophone();
});

test('floating microphone stays outside the collapsed dock, preserves selected device and capture across modes, and opens transcript review', async () => {
  await prepareVoiceMock({ connect: false });
  await expect(page.locator('.composer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Load microphones', exact: true }).click();
  const picker = page.getByLabel('Microphone device', { exact: true });
  await expect(picker).toBeEnabled();
  const device = await picker.locator('option').evaluateAll((options) => options.find((option) => option.value !== 'default').value);
  await picker.selectOption(device);
  await page.evaluate(() => {
    window.__floatingStreams = [];
    window.__floatingConstraints = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__floatingStreams.push(stream);
      window.__floatingConstraints.push(constraints);
      return stream;
    };
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await expectReachableCenteredMicrophone();
  for (const tab of ['Voice', 'Advanced', 'Work', 'Talk', 'Input']) {
    await settings(tab);
    await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeEnabled();
  }
  await expect(picker).toHaveValue(device);
  await expect(picker).toBeDisabled();
  expect(await page.evaluate(() => window.__floatingStreams.length)).toBe(1);
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await expect(page.getByRole('button', { name: 'Expand floating controls', exact: true })).toHaveAttribute('aria-expanded', 'false');
  const mic = page.getByRole('button', { name: 'Stop & transcribe', exact: true });
  await expect(mic).toBeEnabled();
  const recordingPosition = await expectReachableCenteredMicrophone();
  expect(await mic.evaluate((element) => element.closest('.floating-dock-controls') === null)).toBe(true);
  await expect.poll(() => page.getByRole('meter').evaluate((element) => element.value)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__floatingStreams.length)).toBe(1);
  await page.waitForTimeout(600);
  await mic.click();
  await expect(page.getByRole('region', { name: 'Live voice conversation', exact: true })).toBeVisible();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  expect((await expectReachableCenteredMicrophone()).y).toBe(recordingPosition.y);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  expect(await page.evaluate(() => window.__floatingConstraints[0])).toMatchObject({ audio: { deviceId: { exact: device } }, video: false });
  expect(await page.evaluate(() => window.__floatingStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === 'ended'))).toBe(true);
  const micBox = await page.getByRole('button', { name: 'Speak', exact: true }).boundingBox();
  const dockBox = await page.getByRole('group', { name: 'Floating controls dock', exact: true }).boundingBox();
  const handleBox = await page.getByLabel('Move floating mesh', { exact: true }).boundingBox();
  expect(Math.abs(micBox.y + micBox.height / 2 - handleBox.y - handleBox.height / 2)).toBeLessThan(2);
  expect(micBox.x).toBeGreaterThan(handleBox.x + handleBox.width);
  expect(micBox.y).toBeGreaterThanOrEqual(dockBox.y);
  await page.screenshot({ path: test.info().outputPath('floating-microphone-transcript.png'), omitBackground: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Live voice conversation', exact: true })).toBeHidden();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  await settings('Input');
  await expect(picker).toHaveValue(device);
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await settings('Talk');
  await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  expect(await page.evaluate(() => window.__floatingStreams.length)).toBe(2);
  expect(await page.evaluate(() => window.__floatingStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.recordings.length)).toBe(1);
});

test('glass bubble surface spins beneath fixed lighting only while visible with full motion', async () => {
  await prepareVoiceMock({ connect: false });
  const caustic = page.locator('.mic-film');
  const lighting = () => page.locator('.mic-shell').evaluate((button) => ({
    highlight: getComputedStyle(button, '::before').backgroundImage,
    highlightTransform: getComputedStyle(button, '::before').transform,
    shading: getComputedStyle(button, '::after').backgroundImage,
    shadingTransform: getComputedStyle(button, '::after').transform,
    icon: getComputedStyle(button.querySelector('svg')).transform,
  }));
  const fixedLighting = await lighting();
  const transform = () => caustic.evaluate((element) => getComputedStyle(element).transform);
  const initial = await transform();
  await expect.poll(transform).not.toBe(initial);
  expect(await transform()).toMatch(/^matrix3d\(/);
  await expect(caustic).toHaveCSS('transform-style', 'preserve-3d');
  await expect(caustic.locator('.mic-reflection')).toHaveCount(6);
  expect(await page.locator('.mic-caustic').count()).toBe(0);
  expect(await lighting()).toEqual(fixedLighting);
  expect(await page.locator('.record-button').evaluate((button) => button.getAnimations({ subtree: true }).length)).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => caustic.evaluate((element) => element.getAnimations().length)).toBe(0);
  const still = await transform();
  await page.waitForTimeout(150);
  expect(await transform()).toBe(still);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => caustic.evaluate((element) => element.getAnimations()[0]?.playState)).toBe('paused');
  const hidden = await transform();
  await page.waitForTimeout(150);
  expect(await transform()).toBe(hidden);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => caustic.evaluate((element) => element.getAnimations()[0]?.playState)).toBe('running');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('window:state', {
    floating: false, onTop: false, maximized: false, paused: true, floatingSize: null,
  }));
  await expect.poll(() => caustic.evaluate((element) => element.getAnimations()[0]?.playState)).toBe('paused');
  const paused = await transform();
  await page.waitForTimeout(150);
  expect(await transform()).toBe(paused);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('window:state', {
    floating: false, onTop: false, maximized: false, paused: false, floatingSize: null,
  }));
  await expect.poll(transform).not.toBe(paused);
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect.poll(() => page.locator('.record-button').evaluate((button) => button.getAnimations({ subtree: true }).length)).toBe(1);
  await expectReachableCenteredMicrophone();
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
});

test('microphone waves mirror live input, respect reduced motion and stop without affecting capture', async () => {
  await prepareVoiceMock({ connect: false });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800));
  await page.evaluate(() => {
    const original = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (stream) {
      const source = original.call(this, stream);
      const gain = this.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      window.__waveGain = gain;
      window.__waveStream = stream;
      return gain;
    };
  });
  const waves = page.locator('.voice-waves');
  const glow = page.locator('.mic-input-glow');
  const shell = page.locator('.mic-shell');
  const waterSurface = page.locator('.mic-water-surface');
  const ripples = page.locator('.mic-ripples');
  const rippleState = () => ripples.evaluate((element) => ({
    active: element.dataset.active === 'true',
    strength: Number(element.dataset.strength || 0),
    frames: Number(element.dataset.frames || 0),
    map: element.querySelector('feImage').getAttribute('href'),
  }));
  const refracting = async () => (await rippleState()).active;
  const pulse = () => shell.evaluate((element) => {
    const bubble = element.getBoundingClientRect();
    const button = element.closest('button').getBoundingClientRect();
    return {
      scale: new DOMMatrix(getComputedStyle(element).transform).a,
      x: bubble.x + bubble.width / 2 - button.x - button.width / 2,
      y: bubble.y + bubble.height / 2 - button.y - button.height / 2,
    };
  });
  await expect(waves).toHaveCount(0);
  await expect(glow).toHaveCSS('opacity', '0');
  expect(await page.locator('.record-button').evaluate((button) => button.getAnimations({ subtree: true }).length)).toBe(1);
  await page.screenshot({ path: test.info().outputPath('glass-bubble-idle.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(waves).toBeVisible();
  await expect.poll(() => page.getByRole('meter').evaluate((element) => element.value)).toBe(0);
  const silent = await waves.evaluate((canvas) => canvas.toDataURL());
  const silentGlow = await glow.evaluate((element) => Number(getComputedStyle(element).opacity));
  await expect(shell).toHaveCSS('transform', 'none');
  await expect(glow).toHaveCSS('transform', 'none');
  expect(await refracting()).toBe(false);
  await expect(waterSurface).toHaveCSS('filter', 'none');
  await page.waitForTimeout(250);
  expect(await waves.evaluate((canvas) => canvas.toDataURL())).toBe(silent);
  await page.evaluate(() => { window.__waveGain.gain.value = 1; });
  await expect.poll(() => page.getByRole('meter').evaluate((element) => element.value)).toBeGreaterThan(0.01);
  await expect.poll(() => page.locator('.mic-level').evaluate((rect) => Number(rect.getAttribute('height')))).toBeGreaterThan(1);
  await expect.poll(() => glow.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(silentGlow + .2);
  await expect(shell).toHaveCSS('transform', 'none');
  expect(await refracting()).toBe(false);
  expect(await waves.evaluate((canvas) => canvas.toDataURL())).not.toBe(silent);
  const symmetry = await waves.evaluate((canvas) => {
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    let difference = 0;
    let alpha = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < Math.floor(width / 2); x++) {
      const left = (y * width + x) * 4 + 3;
      const right = (y * width + width - 1 - x) * 4 + 3;
      difference += Math.abs(pixels[left] - pixels[right]);
      alpha += pixels[left] + pixels[right];
    }
    return { difference: difference / (width * height / 2), alpha };
  });
  expect(symmetry.alpha).toBeGreaterThan(10000);
  expect(symmetry.difference).toBeLessThan(2);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const moving = await waves.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(250);
  expect(await waves.evaluate((canvas) => canvas.toDataURL())).not.toBe(moving);
  await page.evaluate(() => { window.__waveGain.gain.value = 0; });
  await expect.poll(() => page.getByRole('meter').evaluate((element) => element.value)).toBe(0);
  await expect.poll(refracting).toBe(false);
  await expect(waterSurface).toHaveCSS('filter', 'none');
  const rotationStart = await page.locator('.mic-film').evaluate((element) => {
    const animation = element.getAnimations()[0];
    window.__rippleRotation = animation;
    return Number(animation.currentTime);
  });
  await page.evaluate(() => { window.__waveGain.gain.value = .35; });
  await expect.poll(refracting).toBe(true);
  const soft = await rippleState();
  expect(soft.strength).toBeGreaterThan(.025);
  expect(soft.map).toMatch(/^data:image\/png;base64,/);
  await expect.poll(async () => (await rippleState()).map).not.toBe(soft.map);
  await expect(waterSurface).not.toHaveCSS('filter', 'none');
  await expect(shell).toHaveCSS('filter', 'none');
  await expect(shell.locator(':scope > svg')).toHaveCSS('transform', 'none');
  await expect(page.locator('.mic-ripple')).toHaveCount(0);
  expect(await ripples.locator('feDisplacementMap').getAttribute('in')).toBe('SourceGraphic');
  await page.evaluate(() => { window.__waveGain.gain.value = 10; });
  await expect.poll(() => page.getByRole('meter').evaluate((element) => Number(element.getAttribute('value')))).toBeGreaterThan(.15);
  await page.waitForTimeout(1250);
  expect(await refracting()).toBe(true);
  expect((await rippleState()).frames).toBeGreaterThan(soft.frames + 5);
  expect((await rippleState()).strength).toBe(1);
  await page.evaluate(() => { window.__waveGain.gain.value = 1; });
  await expect.poll(async () => (await rippleState()).strength).toBeGreaterThan(soft.strength + .1);
  expect(await page.locator('.mic-film').evaluate((element) => {
    const animation = element.getAnimations()[0];
    return { same: animation === window.__rippleRotation, state: animation.playState, time: Number(animation.currentTime) };
  })).toEqual({ same: true, state: 'running', time: expect.any(Number) });
  expect(await page.locator('.mic-film').evaluate((element) => Number(element.getAnimations()[0].currentTime))).toBeGreaterThan(rotationStart);
  const loudPulse = await pulse();
  expect(loudPulse.scale).toBeCloseTo(1, 3);
  expect(Math.abs(loudPulse.x)).toBeLessThan(.5);
  expect(Math.abs(loudPulse.y)).toBeLessThan(.5);
  const glowCentre = await glow.evaluate((element) => {
    const glow = element.getBoundingClientRect();
    const button = element.closest('button').getBoundingClientRect();
    return {
      x: glow.x + glow.width / 2 - button.x - button.width / 2,
      y: glow.y + glow.height / 2 - button.y - button.height / 2,
    };
  });
  expect(Math.abs(glowCentre.x)).toBeLessThan(.5);
  expect(Math.abs(glowCentre.y)).toBeLessThan(.5);
  expect(await page.locator('.record-button').evaluate((button) => button.offsetWidth)).toBe(60);
  // Hold the existing glass pose and map while comparing actual filtered pixels.
  await page.evaluate(() => {
    window.__rippleRotation.pause();
    const map = document.querySelector('.mic-ripples feImage');
    const write = map.setAttribute;
    map.setAttribute = function (name, value) { if (name !== 'href') write.call(this, name, value); };
    const light = document.querySelector('.mic-water-light').getContext('2d');
    const paint = light.putImageData;
    light.putImageData = () => {};
    const glow = document.querySelector('.mic-input-glow');
    glow.style.opacity = getComputedStyle(glow).opacity;
    document.querySelector('.mic-level').style.visibility = 'hidden';
    window.__restoreWaterMap = () => {
      map.setAttribute = write;
      light.putImageData = paint;
      glow.style.removeProperty('opacity');
      document.querySelector('.mic-level').style.removeProperty('visibility');
    };
  });
  const refracted = await shell.screenshot();
  await waterSurface.evaluate((element) => { element.style.filter = 'none'; });
  const flat = await shell.screenshot();
  await waterSurface.evaluate((element) => { element.style.removeProperty('filter'); });
  const changedPixels = await application.evaluate(({ nativeImage }, [before, after]) => {
    const wet = nativeImage.createFromBuffer(Buffer.from(before, 'base64')).toBitmap();
    const dry = nativeImage.createFromBuffer(Buffer.from(after, 'base64')).toBitmap();
    let changed = 0;
    for (let i = 0; i < wet.length; i += 4) {
      if (Math.abs(wet[i] - dry[i]) + Math.abs(wet[i + 1] - dry[i + 1]) + Math.abs(wet[i + 2] - dry[i + 2]) > 15) changed++;
    }
    return changed;
  }, [refracted.toString('base64'), flat.toString('base64')]);
  expect(changedPixels).toBeGreaterThan(20);
  await page.evaluate(() => { window.__restoreWaterMap(); window.__rippleRotation.play(); });
  await page.screenshot({ path: test.info().outputPath('glass-microphone-waves.png') });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('window:state', {
    floating: false, onTop: false, maximized: false, paused: true, floatingSize: null,
  }));
  await expect.poll(refracting).toBe(false);
  await expect(waterSurface).toHaveCSS('filter', 'none');
  const pausedFrames = (await rippleState()).frames;
  await page.waitForTimeout(250);
  expect((await rippleState()).frames).toBe(pausedFrames);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('window:state', {
    floating: false, onTop: false, maximized: false, paused: false, floatingSize: null,
  }));
  await expect.poll(refracting).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(shell).toHaveCSS('transform', 'none');
  await expect.poll(refracting).toBe(false);
  await expect(waterSurface).toHaveCSS('filter', 'none');
  const hidden = await waves.evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(200);
  expect(await waves.evaluate((canvas) => canvas.toDataURL())).toBe(hidden);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(waves).toBeVisible();
  await expect.poll(refracting).toBe(true);
  await expectReachableCenteredMicrophone();
  await page.screenshot({ path: test.info().outputPath('floating-microphone-waves.png'), omitBackground: true });
  expect(await waves.evaluate((canvas) => {
    const wave = canvas.getBoundingClientRect();
    const mic = document.querySelector('.record-button').getBoundingClientRect();
    return Math.abs(wave.x + wave.width / 2 - mic.x - mic.width / 2);
  })).toBeLessThan(1);
  expect(await page.evaluate(() => window.__waveStream.getTracks().every((track) => track.readyState === 'live'))).toBe(true);
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation and transcript', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  await expect(waves).toHaveCount(0);
  await expect(glow).toHaveCSS('opacity', '0');
  expect(await refracting()).toBe(false);
  await expect(waterSurface).toHaveCSS('filter', 'none');
  await expect.poll(async () => (await pulse()).scale).toBeLessThan(1.001);
  expect(await page.evaluate(() => window.__waveStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
});

test('floating recognition failures open visible feedback and leave the outside microphone available', async () => {
  await prepareVoiceMock({ connect: false, recognitionError: true });
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  for (let count = 0; count < 4; count++) await page.getByRole('button', { name: 'Make floating window smaller', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse floating controls', exact: true }).click();
  await expectReachableCenteredMicrophone();
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('meter').evaluate((element) => element.value)).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No English speech was recognized');
  await expect(page.getByRole('alert')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Expand floating controls', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await page.getByRole('button', { name: 'Hide voice settings', exact: true }).click();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation and transcript', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('floating-microphone-error-minimum.png'), omitBackground: true });
});

test('live transcription shows local drafts, serializes previews and sends only the final recording', async () => {
  await prepareVoiceMock();
  await settings('Talk');
  const toggle = page.getByRole('checkbox', { name: 'Live transcription (local draft)', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await application.evaluate(({ ipcMain }) => {
    globalThis.__live = { ids: [], pending: false };
    ipcMain.removeHandler('voice:transcribe');
    ipcMain.handle('voice:transcribe', (_event, id) => {
      globalThis.__live.ids.push(id);
      if (globalThis.__live.ids.length === 2) {
        globalThis.__live.pending = true;
        return new Promise((resolve) => {
          globalThis.__live.resolve = () => {
            globalThis.__live.pending = false;
            resolve({ text: 'Late partial must not send.', reviewRequired: false });
          };
        });
      }
      if (globalThis.__live.pending) throw new Error('Overlapping recognition is forbidden.');
      return { text: globalThis.__live.ids.length === 1 ? 'Partial local draft.' : 'Final corrected request.', reviewRequired: false };
    });
    ipcMain.removeHandler('voice:cancel');
    ipcMain.handle('voice:cancel', (_event, id) => {
      globalThis.__voiceReceipt.cancelled.push(id);
      if (id === globalThis.__live.ids[1]) globalThis.__live.resolve();
    });
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(toggle).toBeDisabled();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Partial local draft.', { timeout: 10000 });
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await expect.poll(() => application.evaluate(() => globalThis.__live.pending), { timeout: 10000 }).toBe(true);
  await page.waitForTimeout(3300);
  expect(await application.evaluate(() => globalThis.__live.ids.length)).toBe(2);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Final corrected request.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.map((entry) => entry.text))).toEqual(['Final corrected request.']);
  const ids = await application.evaluate(() => globalThis.__live.ids);
  expect(new Set(ids).size).toBe(3);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.cancelled)).toContain(ids[1]);
  await expect(toggle).toBeEnabled();
});

for (const ending of ['cancel', 'flush failure', 'unmount']) test(`live transcription ${ending} discards late drafts, preserves typed text and releases the microphone`, async () => {
  await prepareVoiceMock();
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep my typed draft.');
  await page.getByRole('checkbox', { name: 'Live transcription (local draft)', exact: true }).check();
  await page.evaluate((ending) => {
    window.__liveTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__liveTracks.push(...stream.getTracks());
      return stream;
    };
    if (ending === 'flush failure') {
      const NativeWorklet = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends NativeWorklet {
        constructor(...args) {
          super(...args);
          const send = this.port.postMessage.bind(this.port);
          this.port.postMessage = (message, ...args) => { if (message !== 'stop') send(message, ...args); };
        }
      };
    }
  }, ending);
  await application.evaluate(({ ipcMain }) => {
    globalThis.__live = { ids: [] };
    ipcMain.removeHandler('voice:transcribe');
    ipcMain.handle('voice:transcribe', (_event, id) => {
      globalThis.__live.ids.push(id);
      return new Promise((resolve) => { globalThis.__live.resolve = () => resolve({ text: 'Cancelled partial.', reviewRequired: false }); });
    });
    ipcMain.removeHandler('voice:cancel');
    ipcMain.handle('voice:cancel', (_event, id) => {
      globalThis.__voiceReceipt.cancelled.push(id);
      if (id === globalThis.__live.ids[0]) globalThis.__live.resolve();
    });
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect.poll(() => application.evaluate(() => globalThis.__live.ids.length), { timeout: 10000 }).toBe(1);
  if (ending === 'unmount') {
    await settings('Advanced');
    await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
  } else {
    await page.getByRole('button', { name: ending === 'cancel' ? 'Cancel recording' : 'Stop & send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep my typed draft.');
    if (ending === 'flush failure') await expect(page.getByRole('alert')).toContainText('The audio worker did not finish.');
  }
  await expect.poll(() => page.evaluate(() => window.__liveTracks.length > 0 && window.__liveTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.cancelled)).toContain(
    (await application.evaluate(() => globalThis.__live.ids))[0]);
});

test('live transcription failure is explicit while final recognition remains available', async () => {
  await prepareVoiceMock();
  await settings('Talk');
  await page.getByRole('checkbox', { name: 'Live transcription (local draft)', exact: true }).check();
  await application.evaluate(({ ipcMain }) => {
    globalThis.__liveCalls = 0;
    ipcMain.removeHandler('voice:transcribe');
    ipcMain.handle('voice:transcribe', () => {
      if (++globalThis.__liveCalls === 1) throw new Error('Synthetic preview failure.');
      return { text: 'Final after preview failure.', reviewRequired: false };
    });

  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Live transcription paused:', { timeout: 10000 });
  await expect(page.getByRole('alert')).toContainText('Synthetic preview failure.');
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Final after preview failure.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.map((entry) => entry.text))).toEqual(['Final after preview failure.']);
});

test('live transcription controls fit the minimum workspace and floating conversation without changing drafts', async () => {
  await prepareVoiceMock({ connect: false });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep this layout draft.');
  await page.getByRole('checkbox', { name: 'Live transcription (local draft)', exact: true }).check();
  await expectSettingsFit();
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation and transcript', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Live transcription (local draft)', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep this layout draft.');
});

test('selected microphone records and transcribes without a connected session, preserving text until explicit send', async () => {
  await prepareVoiceMock({ connect: false });
  await page.evaluate(() => {
    window.__voiceTracks = [];
    window.__voiceConstraints = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__voiceConstraints.push(constraints);
      const stream = await original(constraints);
      window.__voiceTracks.push(...stream.getTracks());
      return stream;
    };
  });

  await page.getByRole('button', { name: 'Load microphones', exact: true }).click();
  await expect(page.getByLabel('Microphone device', { exact: true })).toBeEnabled();
  const device = await page.getByLabel('Microphone device', { exact: true }).locator('option').evaluateAll((options) =>
    options.find((option) => option.value !== 'default').value);
  await page.getByLabel('Microphone device', { exact: true }).selectOption(device);
  await page.getByRole('button', { name: 'Test selected', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Microphone settings' }).getByRole('status')).toContainText('Selected microphone opens successfully.');
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await page.locator('.live-controls').screenshot({ path: path.join(__dirname, '..', '..', '.local', 'microphone-ready-without-session.png') });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  const receipt = await application.evaluate(() => globalThis.__voiceReceipt);
  expect(receipt.recordings).toHaveLength(1);
  expect(receipt.recordings[0]).toMatchObject({ rate: 16000, pcm: 1 });
  expect(receipt.sent).toEqual([]);
  await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => window.__voiceConstraints.at(-1))).toMatchObject({ audio: { deviceId: { exact: device }, channelCount: 1 }, video: false });
  expect(await page.evaluate(() => window.__voiceTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  await settings('Session');
  await page.getByLabel('Existing session ID', { exact: true }).fill('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Connect existing session', exact: true }).click();
  await settings('Talk');
  await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeEnabled();
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  await page.getByRole('button', { name: 'Send text to Copilot', exact: true }).click();
  await expect(page.locator('.live-result')).toContainText('Hello world.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.map((entry) => entry.text))).toEqual(['Say hello world.']);
});

test('local speech check never auto-sends even when connected and preserves the working draft', async () => {
  await prepareVoiceMock();
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep my original working draft.');
  await settings('Input');
  await page.getByRole('tab', { name: 'Speech check', exact: true }).click();
  await page.getByRole('button', { name: 'Test speech locally', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('meter', { name: 'Microphone input level' }).evaluate((meter) => meter.value)).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
  await expect(page.getByLabel('Local test transcript')).toHaveValue('Say hello world.');
  await expect(page.locator('.speech-check')).toContainText('16000 Hz mono PCM16');
  await expect(page.locator('.speech-check')).toContainText('No request sent.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
  await expectSettingsFit();
  await settings('Talk');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep my original working draft.');
});

test('cancelled local speech checks ignore late recognition without replacing drafts or sending', async () => {
  await prepareVoiceMock();
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('voice:transcribe');
    ipcMain.handle('voice:transcribe', () => new Promise((resolve) => {
      globalThis.__finishSpeechCheck = () => resolve({ text: 'Late speech check', reviewRequired: false });
    }));
  });
  await settings('Talk');
  await page.getByLabel('Transcript / typed fallback').fill('Keep the draft after cancellation.');
  await settings('Input');
  await page.getByRole('tab', { name: 'Speech check', exact: true }).click();
  await page.getByRole('button', { name: 'Test speech locally', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
  await expect.poll(() => application.evaluate(() => !!globalThis.__finishSpeechCheck)).toBe(true);
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await application.evaluate(() => globalThis.__finishSpeechCheck());
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Keep the draft after cancellation.');
  await settings('Input');
  await page.getByRole('tab', { name: 'Speech check', exact: true }).click();
  await expect(page.getByLabel('Local test transcript')).toHaveCount(0);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
});

test('recognition language changes use host persistence and low-resolution results wait for explicit send', async () => {
  await writeFile(path.join(profile, 'recognition-settings.json'), JSON.stringify({ version: 1, engine: 'whisper', backend: 'vulkan', root: profile }));
  await prepareVoiceMock({ recognition: { text: 'Do not check why.', confidence: null, tokenProbability: 0.852, reviewRequired: true,
    warning: 'Low-resolution audio (below 16 kHz) can confuse names and exclusions.' } });
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('voice:recognition-ready');
    ipcMain.handle('voice:recognition-ready', () => {});
  });
  await settings('Input');
  await page.getByRole('tab', { name: 'Recognition', exact: true }).click();
  await page.getByLabel('Recognition language', { exact: true }).selectOption('en');
  await expect(page.getByLabel('Recognition language', { exact: true })).toBeEnabled();
  expect(JSON.parse(await readFile(path.join(profile, 'recognition-settings.json'), 'utf8')).language).toBe('en');
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('below 16 kHz');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Do not check why.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
});

test('failed microphone-check cleanup surfaces the error and releases UI ownership', async () => {
  await prepareVoiceMock();
  await page.evaluate(() => {
    const original = AudioContext.prototype.close;
    let attempts = 0;
    AudioContext.prototype.close = async function () {
      if (++attempts <= 2) throw new Error('Synthetic context-close failure');
      return original.call(this);
    };
  });
  await page.getByRole('tab', { name: 'Input', exact: true }).click();
  await page.getByRole('button', { name: 'Load microphones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Test selected', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Test selected', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone cleanup failed: Synthetic context-close failure');
  await expect(page.getByRole('button', { name: 'Test selected', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  expect((await application.evaluate(() => globalThis.__voiceReceipt)).sent).toEqual([]);
});

test('upsampling a browser-reported low-resolution input never bypasses transcript review', async () => {
  await prepareVoiceMock();
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      for (const track of stream.getAudioTracks()) {
        const settings = track.getSettings();
        track.getSettings = () => ({ ...settings, sampleRate: 8000 });
      }
      return stream;
    };
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Upsampling cannot recover missing detail');
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  const receipt = await application.evaluate(() => globalThis.__voiceReceipt);
  expect(receipt.recordings[0].rate).toBe(16000);
  expect(receipt.sent).toEqual([]);
});

for (const delivery of ['chat', 'background', 'terminal']) {
  test(`low-confidence speech in ${delivery} is retained for review and never automatically sent`, async () => {
    await prepareVoiceMock({ connect: delivery === 'chat',
      recognition: { text: 'Please review these uncertain words.', confidence: 0.2, reviewRequired: true } });
    await settings('Session');
    await page.getByLabel('Voice request destination').selectOption(delivery);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await page.waitForTimeout(650);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Please review these uncertain words.');
    await expect(page.getByRole('alert')).toContainText('recognition is uncertain');
    const send = page.getByRole('button', { name: delivery === 'chat' ? 'Send text to Copilot' : 'Prepare work from text', exact: true });
    await expect(send).toBeEnabled();
    expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
    await expect(page.locator('#work-request')).toHaveValue('');
    await page.getByLabel('Transcript / typed fallback').fill('Corrected request.');
    await send.click();
    if (delivery === 'chat') {
      await expect(page.locator('.live-result')).toContainText('Hello world.');
      expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.map((entry) => entry.text))).toEqual(['Corrected request.']);
    } else {
      await expect(page.getByLabel('Confirmed task', { exact: true })).toHaveValue('Corrected request.');
      expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
      await expect(page.getByRole('region', { name: 'Real work confirmation' })).toHaveCount(0);
    }
  });
}

for (const cutoff of ['sample bound', 'wall clock', 'flush bound']) {
  test(`five-minute ${cutoff} preserves capped audio for review and never auto-sends an unfinished request`, async () => {
    await prepareVoiceMock();
    if (cutoff === 'wall clock') await page.clock.install();
    await page.evaluate((cutoff) => {
      window.__longInput = { tracks: [], port: null, rate: 0 };
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__longInput.tracks.push(...stream.getTracks());
        return stream;
      };
      const NativeWorklet = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends NativeWorklet {
        constructor(context, ...args) {
          super(context, ...args);
          window.__longInput.port = this.port;
          window.__longInput.rate = context.sampleRate;
          const send = this.port.postMessage.bind(this.port);
          this.port.postMessage = (message, ...args) => {
            if (cutoff === 'flush bound' && message === 'stop') {
              this.port.onmessage(new MessageEvent('message', { data: new Float32Array(context.sampleRate * 2).fill(-0.5) }));
            }
            send(message, ...args);
          };
        }
      };
    }, cutoff);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await expect(page.locator('#voice-recording-help')).toContainText('maximum 5 minutes');
    await page.evaluate((seconds) => {
      const { port, rate } = window.__longInput;
      port.onmessage(new MessageEvent('message', { data: new Float32Array(rate * seconds).fill(0.5) }));
    }, cutoff === 'wall clock' ? 61 : 299);
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    expect(await application.evaluate(() => globalThis.__voiceReceipt.recordings)).toEqual([]);
    if (cutoff === 'wall clock') {
      await page.clock.fastForward(61000);
      await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
      await page.clock.fastForward(239000);
    } else if (cutoff === 'sample bound') {
      await page.evaluate(() => {
        const { port, rate } = window.__longInput;
        const data = new Float32Array(rate * 2).fill(-0.5);
        port.onmessage(new MessageEvent('message', { data }));
        port.onmessage(new MessageEvent('message', { data }));
      });
    } else await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
    await expect(page.getByRole('alert')).toContainText('Five-minute recording limit reached');
    const receipt = await application.evaluate(() => globalThis.__voiceReceipt);
    expect(receipt.recordings).toHaveLength(1);
    const seconds = (receipt.recordings[0].bytes - 44) / (receipt.recordings[0].rate * 2);
    if (cutoff === 'wall clock') expect(seconds).toBeGreaterThanOrEqual(61);
    else expect(seconds).toBe(300);
    expect(receipt.sent).toEqual([]);
    expect(await page.evaluate(() => window.__longInput.tracks.every((track) => track.readyState === 'ended'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Send text to Copilot', exact: true }).click();
    await expect(page.locator('.live-result')).toContainText('Hello world.');
    expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toHaveLength(1);
  });
}

test('over-limit speech stays intact and cannot be sent until explicitly shortened', async () => {
  const text = 'A longer recognized request. '.repeat(50);
  await prepareVoiceMock({ recognition: { text, confidence: 0.9, reviewRequired: true } });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue(text);
  await expect(page.getByRole('alert')).toContainText('shorten the transcript');
  await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeDisabled();
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await page.getByLabel('Transcript / typed fallback').fill('Shortened request.');
  await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeEnabled();
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await page.getByRole('button', { name: 'Send text to Copilot', exact: true }).click();
  await expect(page.locator('.live-result')).toContainText('Hello world.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.map((entry) => entry.text))).toEqual(['Shortened request.']);
});

test('a long orchestration transcript remains intact above the request limit without calling a controller', async () => {
  const text = 'Preserve every word in this long recording. '.repeat(300);
  await prepareVoiceMock({ recognition: { text, confidence: 0.9, reviewRequired: false } });
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('orchestration:request');
    ipcMain.handle('orchestration:request', () => { throw new Error('Over-limit speech must not reach the controller.'); });
  });
  await settings('Session');
  await page.getByLabel('Voice request destination').selectOption('orchestrate');
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue(text);
  await expect(page.getByRole('alert')).toContainText('request limit is 10,000');
  await expect(page.getByRole('button', { name: 'Send to Intercom', exact: true })).toBeDisabled();
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
});

test('microphone recording denial without a session stays visible and allows a clean retry', async () => {
  await prepareVoiceMock({ connect: false });
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__retryTracks = [];
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
    window.__restoreRecording = () => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__retryTracks.push(...stream.getTracks());
        return stream;
      };
    };
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone failed: Permission denied');
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await page.evaluate(() => window.__restoreRecording());
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0);
  await settings('Talk');
  await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  expect(await page.evaluate(() => window.__retryTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.recordings)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
});

  test('real selected-device push-to-talk captures PCM, shows a signal and returns the correlated response through mocked backend IPC', async () => {
    await prepareVoiceMock();
    await page.evaluate(() => {
      window.__voiceTracks = [];
      window.__voiceConstraints = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.__voiceConstraints.push(constraints);
        const stream = await original(constraints);
        window.__voiceTracks.push(...stream.getTracks());
        return stream;
      };
    });
    await page.getByRole('button', { name: 'Load microphones', exact: true }).click();
    await expect(page.getByLabel('Microphone device', { exact: true })).toBeEnabled();
    const device = await page.getByLabel('Microphone device', { exact: true }).locator('option').evaluateAll((options) => options.find((option) => option.value !== 'default').value);
    await page.getByLabel('Microphone device', { exact: true }).selectOption(device);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Microphone device', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Floating mesh', exact: true })).toBeEnabled();
    await page.keyboard.press('Control+Shift+M');
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await expect.poll(() => page.getByRole('meter').evaluate((meter) => meter.value)).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.locator('.live-result')).toContainText('Hello world.');
    await page.keyboard.press('Control+Shift+M');
    await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
    await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
    const receipt = await application.evaluate(() => globalThis.__voiceReceipt);
    expect(receipt.recordings).toHaveLength(1);
    expect(receipt.recordings[0]).toMatchObject({ rate: 16000, pcm: 1 });
    expect(receipt.recordings[0].bytes).toBeGreaterThan(16000);
    expect(receipt.sent).toEqual([{ id: receipt.recordings[0].id, text: 'Say hello world.' }]);
    expect(await page.evaluate(() => window.__voiceConstraints.at(-1))).toMatchObject({ audio: { deviceId: { exact: device }, channelCount: 1 } });
    expect(await page.evaluate(() => window.__voiceTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  });

  test('cancelled dispatch ignores late responses and cannot duplicate a running request', async () => {
    await prepareVoiceMock({ delayed: true });
    await settings('Talk');
    await page.getByLabel('Transcript / typed fallback').fill('Say hello world.');
    await page.getByRole('button', { name: 'Send text to Copilot', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Cancelled');
    await application.evaluate(() => globalThis.__resolveVoice());
    await expect(page.locator('.live-result')).toHaveCount(0);
    expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.length)).toBe(1);
    expect(await application.evaluate(() => globalThis.__voiceReceipt.cancelled.length)).toBe(1);
  });

  test('recognition failure never dispatches, releases tracks and preserves a visible error', async () => {
    await prepareVoiceMock({ recognitionError: true });
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No English speech was recognized');
    expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.length)).toBe(0);
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  });

test('transcript review waits for explicit send and leaving live mode releases capture', async () => {
  await prepareVoiceMock();
  await settings('Advanced');
  await page.getByLabel('Send recognized text automatically after stopping').uncheck();
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'Stop & transcribe', exact: true }).click();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await page.getByLabel('Transcript / typed fallback').fill('Say hello world again.');
  await page.getByRole('button', { name: 'Send text to Copilot', exact: true }).click();
  await expect(page.locator('.live-result')).toContainText('Hello world.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent[0].text)).toBe('Say hello world again.');
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__leavingTracks = stream.getTracks();
      return stream;
    };
  });
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await settings('Advanced');
  await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__leavingTracks.every((track) => track.readyState === 'ended'))).toBe(true);
});

async function observeSpeechWithoutPlayback(delayed = false) {
  await application.evaluate(({ app }, delay) => {
    const nativeRequire = process.getBuiltinModule('node:module').createRequire(`${app.getAppPath()}\\package.json`);
    const { VoiceHost } = nativeRequire('./desktop/services/voice.cjs');
    const original = VoiceHost.prototype.process;
    globalThis.__profileSpeech = { utterances: [], stopped: 0 };
    VoiceHost.prototype.process = function (operation, executable, args, options) {
      if (options?.mode !== 'speak') return original.call(this, operation, executable, args, options);
      globalThis.__profileSpeech.utterances.push(JSON.parse(options.input));
      if (!delay) return Promise.resolve('');
      return new Promise((_resolve, reject) => {
        operation.controller.signal.addEventListener('abort', () => {
          globalThis.__profileSpeech.stopped++;
          reject(new Error('Local speech operation cancelled.'));
        }, { once: true });
      });
    };
  }, delayed);
}

async function setVoiceControl(key, value) {
  await page.locator(`#voice-${key}`).evaluate((input, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('real voice-profile bridge previews unsaved controls, saves/activates/renames/deletes and restores the active voice on reload', async () => {
  await observeSpeechWithoutPlayback();
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await voiceTab('Voice');
  const panel = page.locator('.voice-profiles');
  await expect(panel.locator('.voice-profile-active')).toContainText('Standard');
  await expect(page.getByLabel('Speaking voice / accent')).toBeEnabled();
  const voice = await page.getByLabel('Speaking voice / accent').locator('option').evaluateAll((options) => options.find((option) => option.value).value);
  await page.getByLabel('Speaking voice / accent').selectOption(voice);
  await voiceTab('Profiles');
  await page.getByLabel('Voice profile name', { exact: true }).fill('Evening');
  await voiceTab('Tune');
  await setVoiceControl('pitch', 5); await setVoiceControl('rate', -2); await setVoiceControl('volume', 45);
  await voiceTab('Preview');
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect(panel).toContainText('Preview finished');
  expect(await application.evaluate(() => globalThis.__profileSpeech.utterances.at(-1))).toMatchObject({ voiceId: voice, pitch: 5, rate: -2, volume: 45 });
  const before = await page.evaluate(() => window.intercom.voiceProfiles());
  expect(before.profiles[0]).toMatchObject({ name: 'Standard', parameters: { pitch: 0, rate: 1, volume: 100 } });
  await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
  await expect(panel.locator('.voice-profile-active')).toContainText('Evening');
  await voiceTab('Profiles');
  await page.getByRole('button', { name: 'Duplicate profile', exact: true }).click();
  await page.getByLabel('Voice profile name', { exact: true }).fill('Morning');
  await voiceTab('Tune');
  await setVoiceControl('rate', 3);
  await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
  await expect(panel.locator('.voice-profile-active')).toContainText('Morning');
  await voiceTab('Profiles');
  await expect(page.getByRole('button', { name: 'Delete profile', exact: true })).toBeDisabled();
  await page.evaluate(() => window.intercom.speakVoice('Fixture work completion; no Copilot task was sent.'));
  expect(await application.evaluate(() => globalThis.__profileSpeech.utterances.at(-1))).toMatchObject({ voiceId: voice, pitch: 5, rate: 3, volume: 45 });
  await page.getByLabel('Saved voice profile', { exact: true }).selectOption({ label: 'Evening' });
  await page.getByRole('button', { name: 'Use saved profile', exact: true }).click();
  await expect(panel.locator('.voice-profile-active')).toContainText('Evening');
  await page.getByLabel('Saved voice profile', { exact: true }).selectOption({ label: 'Morning' });
  await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
  await expect(page.getByLabel('Saved voice profile').locator('option')).toHaveCount(1);
  await page.reload();
  await voiceTab('Voice');
  await expect(page.locator('.voice-profile-active')).toContainText('Evening');
  await expect(page.locator('#voice-pitch')).toHaveValue('5');
  await expect(page.locator('#voice-rate')).toHaveValue('-2');
  await expect(page.locator('#voice-volume')).toHaveValue('45');
  await expect(page.getByLabel('Speaking voice / accent')).toHaveValue(voice);
  await voiceTab('Profiles');
  await page.getByLabel('Voice profile name', { exact: true }).fill('Evening revised');
  await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
  await expect(page.locator('.voice-profile-active')).toContainText('Evening revised');
  await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: test.info().outputPath('voice-profiles.png') });
});

test('starting capture cancels only the owned preview and locks voice controls until recording finishes', async () => {
  await observeSpeechWithoutPlayback(true);
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await settings('Session');
  await page.getByLabel('Voice request destination').selectOption('background');
  await voiceTab('Preview');
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  expect(await application.evaluate(() => globalThis.__profileSpeech.stopped)).toBe(1);
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeDisabled();
  await expect(page.locator('#voice-pitch')).toBeDisabled();
  await expect(page.locator('.voice-profiles .voice-error')).toHaveCount(0);
  await settings('Talk');
  await page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  await voiceTab('Preview');
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled();
});
