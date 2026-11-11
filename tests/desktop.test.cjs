const { test, expect, _electron } = require('@playwright/test');
const path = require('node:path');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const { syntheticTone } = require('./synthetic-audio.cjs');

let application;
let page;
let profile;
let errors;
let meshFile;

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
  const bounds = await page.locator('canvas').boundingBox();
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
  const fakeAudio = path.join(profile, 'synthetic-tone.wav');
  await writeFile(fakeAudio, syntheticTone());
  meshFile = path.join(profile, 'context-index.json');
  await writeFile(meshFile, JSON.stringify(testMesh()));
  errors = [];
  const executablePath = process.env.INTERCOM_TEST_EXECUTABLE;
  application = await _electron.launch({
    executablePath,
    args: [...(executablePath ? [] : [path.join(__dirname, '..')]), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeAudio}`],
    env: { ...process.env, INTERCOM_PROFILE_DIR: profile, INTERCOM_CONTEXT_MESH_PATH: meshFile },
  });
  page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Everything has a connection.' })).toBeVisible();
  await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH');
  await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
});

test.afterEach(async () => {
  await application?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  expect(errors).toEqual([]);
});

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
    executablePath, args: executablePath ? [] : [path.join(__dirname, '..')],
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
  await page.getByLabel('Target context', { exact: true }).selectOption('ctx-test');
  await page.getByRole('button', { name: 'Find existing sessions', exact: true }).click();
  await expect(page.getByLabel('Choose an existing session').locator('option[value="22222222-2222-4222-8222-222222222222"]')).toBeDisabled();
  await page.getByLabel('Choose an existing session').selectOption('11111111-1111-4111-8111-111111111111');
  await page.getByLabel('Confirmed task', { exact: true }).fill('Run Get-Location and say hello world.');
  await page.getByRole('button', { name: 'Review target and task', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Real work confirmation' })).toContainText('allow-all OFF');
  await expect(page.locator('.real-job')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm this target and task', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Copilot tool permission' })).toContainText('Get-Location');
  await page.getByLabel('Voice request destination').selectOption('background');
  await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Copilot tool permission' })).toBeVisible();
  await page.getByRole('button', { name: 'Allow this operation once', exact: true }).click();
  await expect(page.locator('.real-job')).toContainText('Hello world.');
  expect(await application.evaluate(() => globalThis.__workUI.approvals)).toEqual([
    { jobId: '11111111-1111-4111-8111-111111111111', permissionId: '8', optionId: 'yes' },
  ]);
  await expect.poll(() => application.evaluate(() => globalThis.__workUI.speech.length)).toBe(1);
  await page.reload();
  await expect(page.locator('.real-job')).toContainText('Hello world.');
  await page.waitForTimeout(100);
  expect(await application.evaluate(() => globalThis.__workUI.speech.length)).toBe(1);
  await page.getByRole('button', { name: 'Acknowledge receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Acknowledge receipt', exact: true })).toHaveCount(0);
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
  await expect(page.locator('.titlebar .brand-logo')).toBeHidden();
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

test('floating dock starts collapsed, expands to one scrollable row and preserves window and graph controls', async () => {
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
  expect(smallLayout.height).toBeLessThan(56);
  const row = await page.locator('.floating-dock-controls').evaluate((element) => ({
    overflowing: element.scrollWidth > element.clientWidth,
    centers: [...element.children].map((child) => { const rect = child.getBoundingClientRect(); return rect.y + rect.height / 2; }),
  }));
  expect(row.overflowing).toBe(true);
  expect(Math.max(...row.centers) - Math.min(...row.centers)).toBeLessThan(2);
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
  const canvas = page.locator('canvas');
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
  const canvas = page.locator('canvas');
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
  const canvas = page.locator('canvas');
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
  await page.screenshot({ path: path.join(__dirname, '..', '.local', 'node-inspection-floating.png') });
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
  await page.locator('canvas').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Pinned node details' })).toBeVisible();
  await page.locator('canvas').evaluate((canvas) => {
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
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.fixture-badge')).toHaveText('ACTUAL LOCAL MESH');
  await page.waitForTimeout(250);
  const idle = await page.evaluate(() => window.__frameRequests);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__frameRequests)).toBe(idle);
  await page.locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const details = page.getByRole('region', { name: 'Pinned node details' });
  await expect(details).toBeVisible();
  await page.waitForTimeout(100);
  const pinnedIdle = await page.evaluate(() => window.__frameRequests);
  const anchor = await details.boundingBox();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__frameRequests)).toBe(pinnedIdle);
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
    await page.getByLabel('Speak progress and responses (local Windows voice)').uncheck();
    if (connect) {
      await page.getByLabel('Existing session ID', { exact: true }).fill('11111111-1111-4111-8111-111111111111');
      await page.getByRole('button', { name: 'Connect existing session', exact: true }).click();
      await expect(page.getByText('Session connected - settings', { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
  }

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
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await expect(page.getByRole('button', { name: 'Expand floating controls', exact: true })).toHaveAttribute('aria-expanded', 'false');
  const mic = page.getByRole('button', { name: 'Stop & transcribe', exact: true });
  await expect(mic).toBeEnabled();
  expect(await mic.evaluate((element) => element.closest('.floating-tools') === null)).toBe(true);
  await expect.poll(() => page.getByRole('meter').evaluate((element) => element.value)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__floatingStreams.length)).toBe(1);
  await page.waitForTimeout(600);
  await mic.click();
  await expect(page.getByRole('region', { name: 'Live voice conversation', exact: true })).toBeVisible();
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  expect(await page.evaluate(() => window.__floatingConstraints[0])).toMatchObject({ audio: { deviceId: { exact: device } }, video: false });
  expect(await page.evaluate(() => window.__floatingStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === 'ended'))).toBe(true);
  const micBox = await page.getByRole('button', { name: 'Speak', exact: true }).boundingBox();
  const dockBox = await page.getByRole('group', { name: 'Floating controls dock', exact: true }).boundingBox();
  expect(micBox.y + micBox.height).toBeLessThan(dockBox.y);
  await page.screenshot({ path: test.info().outputPath('floating-microphone-transcript.png'), omitBackground: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Live voice conversation', exact: true })).toBeHidden();
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'true');
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+M');
  await expect(page.locator('main')).toHaveAttribute('data-floating', 'false');
  await expect(picker).toHaveValue(device);
  await expect(page.getByRole('button', { name: 'Stop & transcribe', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  expect(await page.evaluate(() => window.__floatingStreams.length)).toBe(2);
  expect(await page.evaluate(() => window.__floatingStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === 'ended'))).toBe(true);
  expect(await application.evaluate(() => globalThis.__voiceReceipt.recordings.length)).toBe(1);
});

test('floating recognition failures open visible feedback and leave the outside microphone available', async () => {
  await prepareVoiceMock({ connect: false, recognitionError: true });
  await page.getByRole('button', { name: 'Floating mesh', exact: true }).click();
  await page.getByRole('button', { name: 'Expand floating controls', exact: true }).click();
  for (let count = 0; count < 4; count++) await page.getByRole('button', { name: 'Make floating window smaller', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse floating controls', exact: true }).click();
  await page.getByRole('button', { name: 'Voice settings and transcript', exact: true }).click();
  await page.getByText('Microphone, session and delivery settings', { exact: true }).click();
  expect(await page.locator('.live-conversation').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  })).toBeGreaterThan(0);
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
  await page.getByRole('button', { name: 'Voice settings and transcript', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('floating-microphone-error-minimum.png'), omitBackground: true });
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
  await page.locator('.live-controls').screenshot({ path: path.join(__dirname, '..', '.local', 'microphone-ready-without-session.png') });
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
  await page.getByLabel('Existing session ID', { exact: true }).fill('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Connect existing session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send text to Copilot', exact: true })).toBeEnabled();
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
  await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Say hello world.');
  await page.getByRole('button', { name: 'Send text to Copilot', exact: true }).click();
  await expect(page.locator('.live-result')).toContainText('Hello world.');
  expect(await application.evaluate(() => globalThis.__voiceReceipt.sent.map((entry) => entry.text))).toEqual(['Say hello world.']);
});

for (const delivery of ['chat', 'background', 'terminal']) {
  test(`low-confidence speech in ${delivery} is retained for review and never automatically sent`, async () => {
    await prepareVoiceMock({ connect: delivery === 'chat',
      recognition: { text: 'Please review these uncertain words.', confidence: 0.2, reviewRequired: true } });
    await page.getByLabel('Voice request destination').selectOption(delivery);
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
    await page.waitForTimeout(650);
    await page.getByRole('button', { name: 'Stop & send', exact: true }).click();
    await expect(page.getByLabel('Transcript / typed fallback')).toHaveValue('Please review these uncertain words.');
    await expect(page.getByRole('alert')).toContainText('low confidence');
    const send = page.getByRole('button', { name: delivery === 'chat' ? 'Send text to Copilot' : 'Prepare work from text', exact: true });
    await expect(send).toBeEnabled();
    expect(await application.evaluate(() => globalThis.__voiceReceipt.sent)).toEqual([]);
    await expect(page.getByLabel('Confirmed task', { exact: true })).toHaveValue('');
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
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
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
  await page.getByRole('button', { name: 'Show fixture demo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__leavingTracks.every((track) => track.readyState === 'ended'))).toBe(true);
});

async function observeSpeechWithoutPlayback(delayed = false) {
  await application.evaluate(({ app }, delay) => {
    const nativeRequire = process.getBuiltinModule('node:module').createRequire(`${app.getAppPath()}\\package.json`);
    const { VoiceHost } = nativeRequire('./desktop/voice.cjs');
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
  await page.getByText('Voice profiles / customize speech', { exact: true }).click();
  const panel = page.locator('.voice-profiles');
  await expect(panel.locator('.voice-profile-active')).toContainText('Standard');
  await expect(page.getByLabel('Speaking voice / accent')).toBeEnabled();
  const voice = await page.getByLabel('Speaking voice / accent').locator('option').evaluateAll((options) => options.find((option) => option.value).value);
  await page.getByLabel('Speaking voice / accent').selectOption(voice);
  await page.getByLabel('Voice profile name', { exact: true }).fill('Evening');
  await setVoiceControl('pitch', 5); await setVoiceControl('rate', -2); await setVoiceControl('volume', 45);
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect(panel).toContainText('Preview finished');
  expect(await application.evaluate(() => globalThis.__profileSpeech.utterances.at(-1))).toMatchObject({ voiceId: voice, pitch: 5, rate: -2, volume: 45 });
  const before = await page.evaluate(() => window.intercom.voiceProfiles());
  expect(before.profiles[0]).toMatchObject({ name: 'Standard', parameters: { pitch: 0, rate: 1, volume: 100 } });
  await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
  await expect(panel.locator('.voice-profile-active')).toContainText('Evening');
  await page.getByRole('button', { name: 'Duplicate profile', exact: true }).click();
  await page.getByLabel('Voice profile name', { exact: true }).fill('Morning');
  await setVoiceControl('rate', 3);
  await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
  await expect(panel.locator('.voice-profile-active')).toContainText('Morning');
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
  await page.getByText('Voice profiles / customize speech', { exact: true }).click();
  await expect(page.locator('.voice-profile-active')).toContainText('Evening');
  await expect(page.locator('#voice-pitch')).toHaveValue('5');
  await expect(page.locator('#voice-rate')).toHaveValue('-2');
  await expect(page.locator('#voice-volume')).toHaveValue('45');
  await expect(page.getByLabel('Speaking voice / accent')).toHaveValue(voice);
  await page.getByLabel('Voice profile name', { exact: true }).fill('Evening revised');
  await page.getByRole('button', { name: 'Save & use profile', exact: true }).click();
  await expect(page.locator('.voice-profile-active')).toContainText('Evening revised');
  await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: test.info().outputPath('voice-profiles.png') });
});

test('starting capture cancels only the owned preview and locks voice controls until recording finishes', async () => {
  await observeSpeechWithoutPlayback(true);
  await page.getByRole('button', { name: 'Use live voice', exact: true }).click();
  await page.getByLabel('Voice request destination').selectOption('background');
  await page.getByText('Voice profiles / customize speech', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop preview', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop & send', exact: true })).toBeVisible();
  expect(await application.evaluate(() => globalThis.__profileSpeech.stopped)).toBe(1);
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeDisabled();
  await expect(page.locator('#voice-pitch')).toBeDisabled();
  await expect(page.locator('.voice-profiles .voice-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled();
});
