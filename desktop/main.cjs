const { app, BrowserWindow, ipcMain, Menu, session, Notification, screen, dialog, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { VoiceHost } = require('./services/voice.cjs');
const { loadMesh } = require('./services/mesh.cjs');
const { WorkHost } = require('./services/work.cjs');
const { OrchestrationHost } = require('./services/orchestration.cjs');
const { overlapsWorkspace } = require('./services/session-catalog.cjs');
const { Diagnostics } = require('./services/diagnostics.cjs');

const profilePath = process.env.INTERCOM_PROFILE_DIR || path.join(app.getPath('appData'), 'IntercomVoicePrototype');
app.setPath('userData', profilePath);
if (!app.requestSingleInstanceLock()) app.exit(0);
if (process.platform === 'win32') app.setAppUserModelId('io.github.zanark.intercom.prototype');

let window;
let fullBounds;
let fullMaximized = false;
let floating = false;
let onTop = false;
let currentMesh;
const diagnostics = new Diagnostics(profilePath, {
  version: app.getVersion(), resourcesPath: app.isPackaged ? process.resourcesPath : '',
  metrics: () => app.getAppMetrics(),
  native: () => {
    const worker = voice.recognizer?.native.worker;
    return worker ? { pid: worker.child.pid, ready: worker.ready, closed: worker.closed, stopping: !!worker.stopping } : null;
  },
  onFailure: (status) => {
    console.error(status.error);
    if (window && !window.isDestroyed()) window.webContents.send('diagnostics:changed', status);
  },
});
void diagnostics.record('app.start');
app.on('second-instance', () => { void diagnostics.record('app.second-instance'); });
app.on('child-process-gone', (_event, details) => {
  void diagnostics.record(details.reason === 'clean-exit' ? 'process.exit' : 'process.failure',
    { component: details.type, reason: details.reason, exitCode: details.exitCode },
    details.reason === 'clean-exit' ? undefined : new Error('An application child process exited.'));
});
process.on('uncaughtExceptionMonitor', (error) => { void diagnostics.record('app.failure', {}, error); });
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => diagnostics.run(channel, () => {
    requireOwnFrame(event);
    return handler(event, ...args);
  }));
}
const page = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const state = () => ({
  floating, onTop,
  floatingSize: floatingSize(),
  maximized: !!window && window.isMaximized(),
  paused: !!window && (window.isMinimized() || !window.isVisible()),
});
const voice = new VoiceHost(profilePath, (event) => {
  if (window && !window.isDestroyed()) window.webContents.send('voice:progress', event);
}, { bundledRoot: app.isPackaged ? path.join(process.resourcesPath, 'speech') : '', diagnostics });
const work = new WorkHost(profilePath, () => currentMesh, (event) => {
  if (window && !window.isDestroyed()) window.webContents.send('work:progress', event);
}, async (job) => {
  if (job.phase === 'terminal-opened') return;
  if (!Notification.isSupported()) throw new Error('Windows notifications are not supported.');
  await new Promise((resolve, reject) => {
    const notification = new Notification({
      title: 'Intercom',
      body: `${job.contextName}: ${job.phase === 'responded' ? 'Copilot has responded. Review the result.' : 'Work needs attention. Review the receipt.'}`,
      icon: path.join(__dirname, '..', 'dist', 'branding', 'intercom-icon.png'),
    });
    const timer = setTimeout(() => reject(new Error('Windows did not acknowledge the notification.')), 5000);
    notification.once('show', () => { clearTimeout(timer); resolve(); });
    notification.once('failed', (_event, error) => { clearTimeout(timer); reject(new Error(error)); });
    notification.on('click', () => { if (window && !window.isDestroyed()) { window.show(); window.focus(); } });
    notification.show();
  });
}, { assertAvailable: (id, workspace) => {
  assertOwnerAvailable(voice.work, id, workspace);
  orchestration.assertOwnedAvailable(id, workspace);
} });
const orchestration = new OrchestrationHost(profilePath, () => currentMesh, (event) => {
  if (window && !window.isDestroyed()) window.webContents.send('orchestration:progress', event);
}, { openReport: (file) => shell.openPath(file), assertAvailable: (id, workspace) => {
  assertOwnerAvailable(voice.work, id, workspace);
  assertOwnerAvailable(work.active, id, workspace);
} });
function assertOwnerAvailable(owner, id, workspace) {
  if (owner?.sessionId === id || (workspace && owner?.workspace && overlapsWorkspace(owner.workspace, workspace))) {
    throw new Error('Intercom already owns that session or overlapping workspace. Wait or cancel the identified operation.');
  }
}
voice.assertAvailable = (id, workspace) => {
  assertOwnerAvailable(work.active, id, workspace);
  orchestration.assertOwnedAvailable(id, workspace);
};

function publish() {
  window.webContents.send('window:state', state());
}

function floatingSize() {
  if (!floating || !window) return null;
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  return { side: bounds.width, min: 360, max: Math.max(360, Math.min(1080, area.width, area.height)) };
}

function resizeFloating(delta) {
  if (!floating) throw new Error('Switch to Floating Mesh before resizing it.');
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const { min, max } = floatingSize();
  const side = Math.max(min, Math.min(max, bounds.width + delta));
  window.setBounds({
    x: Math.max(area.x, Math.min(area.x + area.width - side, bounds.x + Math.round((bounds.width - side) / 2))),
    y: Math.max(area.y, Math.min(area.y + area.height - side, bounds.y + Math.round((bounds.height - side) / 2))),
    width: side, height: side,
  });
  publish();
  return state();
}

function setFloating(value) {
  if (floating === value) return state();
  if (value) {
    fullMaximized = window.isMaximized();
    fullBounds = fullMaximized ? window.getNormalBounds() : window.getBounds();
    floating = true;
    if (fullMaximized) window.unmaximize();
    window.setMinimumSize(360, 360);
    const side = Math.min(540, fullBounds.width, fullBounds.height);
    window.setBounds({
      x: fullBounds.x + Math.round((fullBounds.width - side) / 2),
      y: fullBounds.y + Math.round((fullBounds.height - side) / 2),
      width: side,
      height: side,
    });
  } else {
    floating = false;
    window.setMinimumSize(960, 680);
    if (fullBounds) window.setBounds(fullBounds);
    if (fullMaximized) window.maximize();
  }
  publish();
  return state();
}

function requireOwnFrame(event) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('Window control is restricted to the main Intercom frame.');
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window?.webContents && details.isMainFrame &&
      details.requestingUrl === page && permission === 'media' &&
      details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio');
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === window?.webContents && details.isMainFrame && details.requestingUrl === page &&
    permission === 'media' && details.mediaType === 'audio');
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const localAsset = details.url.startsWith(pathToFileURL(path.join(__dirname, '..', 'dist') + path.sep).href);
    callback({ cancel: !localAsset });
  });
  window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    title: 'Intercom Prototype',
    icon: path.join(__dirname, '..', 'dist', 'branding', 'intercom.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });
  for (const event of ['minimize', 'restore', 'show', 'hide', 'maximize', 'unmaximize', 'resized', 'moved']) window.on(event, publish);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => {
    void diagnostics.record('renderer.failure', { reason: details.reason, exitCode: details.exitCode },
      new Error('The renderer exited.'));
  });
  window.webContents.on('preload-error', (_event, _file, error) => { void diagnostics.record('renderer.failure', {}, error); });
  ipcMain.handle('diagnostics:status', (event) => { requireOwnFrame(event); return diagnostics.status(); });
  ipcMain.handle('diagnostics:phase', (event, phase) => {
    requireOwnFrame(event);
    if (!['idle', 'connecting', 'setup', 'opening', 'listening', 'transcribing', 'checking', 'running'].includes(phase)) {
      throw new Error('Unsupported diagnostic phase.');
    }
    return diagnostics.record('voice.phase', { phase });
  });
  ipcMain.handle('diagnostics:renderer-failure', (event, kind) => {
    requireOwnFrame(event);
    if (!['error', 'unhandled-rejection', 'microphone-failed'].includes(kind)) throw new Error('Unsupported renderer failure kind.');
    return diagnostics.record('renderer.failure', { reason: kind }, new Error('Renderer operation failed.'));
  });
  handle('diagnostics:open', async () => {
    await diagnostics.flush();
    const error = await shell.openPath(diagnostics.directory);
    if (error) throw new Error(`Diagnostics folder could not be opened: ${error}`);
  });
  handle('window:action', (event, action) => {
    requireOwnFrame(event);
    switch (action) {
      case 'state': return state();
      case 'toggle-floating': return setFloating(!floating);
      case 'shrink-floating': return resizeFloating(-48);
      case 'grow-floating': return resizeFloating(48);
      case 'toggle-maximize':
        if (floating) throw new Error('Restore the workspace before maximizing the window.');
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        publish();
        return state();
      case 'toggle-top':
        onTop = !onTop;
        window.setAlwaysOnTop(onTop);
        publish();
        return state();
      case 'minimize': window.minimize(); return state();
      case 'close': window.close(); return state();
      default: throw new Error('Unsupported window action.');
    }
  });
  let meshLoad;
  handle('mesh:load', (event) => {
    requireOwnFrame(event);
    if (meshLoad) return meshLoad;
    currentMesh = undefined;
    meshLoad = loadMesh().then((snapshot) => { currentMesh = snapshot; return snapshot; }).finally(() => { meshLoad = undefined; });
    return meshLoad;
  });
  const workHandlers = {
    state: () => work.state(),
    sessions: (contextId) => work.list(contextId),
    prepare: (...args) => work.prepare(...args),
    confirm: (id) => work.confirm(id),
    approve: (...args) => work.approve(...args),
    acknowledge: (id) => work.acknowledge(id),
    cancel: (id) => work.cancel(id),
  };
  for (const [action, handler] of Object.entries(workHandlers)) {
    handle(`work:${action}`, (_event, ...args) => handler(...args));
  }
  const voiceHandlers = {
    settings: () => voice.settings(),
    'recognition-settings': () => voice.recognitionSettings(),
    'recognition-ready': (id) => voice.recognitionReady(id),
    'recognition-language': (id, language) => voice.setRecognitionLanguage(id, language),
    'configure-recognition': (id, engine) => voice.configureRecognition(id, engine, async () => {
      const choice = await dialog.showOpenDialog(window, {
        title: 'Choose pinned local speech engine (model and runtime folder)',
        properties: ['openDirectory'],
      });
      return choice.canceled ? null : choice.filePaths[0];
    }),
    profiles: () => voice.profiles.read(),
    'voice-catalog': () => voice.voiceCatalog(),
    'save-profile': (profile) => voice.profiles.save(profile),
    'activate-profile': (id) => voice.profiles.activate(id),
    'delete-profile': (id) => voice.profiles.remove(id),
    preview: (text, profile) => voice.speak(text, profile),
    configure: (id, sessionId) => voice.configure(id, sessionId),
    transcribe: (id, wave) => voice.transcribe(id, wave),
    send: (id, text) => voice.send(id, text),
    cancel: (id) => voice.cancel(id),
    speak: (text) => voice.speak(text),
    'stop-speech': () => voice.stopSpeech(),
  };
  for (const [action, handler] of Object.entries(voiceHandlers)) {
    handle(`voice:${action}`, (_event, ...args) => handler(...args));
  }
  const orchestrationHandlers = {
    state: async () => ({ plans: await orchestration.state(), requestActivity: structuredClone(orchestration.requestActivity), error: orchestration.failure?.message }),
    request: (id, text, profile) => orchestration.request(id, text, profile),
    'cancel-request': (id) => orchestration.cancelRequest(id),
    'open-report': (id) => orchestration.research.open(id),
    'research-targets': (id) => orchestration.researchTargets(id),
    'synthesize-report': (...args) => orchestration.synthesize(...args),
    cancel: (id) => orchestration.cancel(id),
    approve: (...args) => orchestration.approve(...args),
    acknowledge: (id) => orchestration.acknowledge(id),
  };
  for (const [action, handler] of Object.entries(orchestrationHandlers)) {
    handle(`orchestration:${action}`, (_event, ...args) => handler(...args));
  }
  const ready = new Promise((resolve) => window.once('ready-to-show', resolve));
  await window.loadURL(page);
  await ready;
  await diagnostics.record('app.ready');
  window.show();
  window.on('close', (event) => {
    event.preventDefault();
    void Promise.all([voice.close(), work.close(), orchestration.close()]).then(async () => {
      await diagnostics.record('app.exit');
      window?.destroy();
    }).catch((error) => {
      void diagnostics.record('app.failure', { component: 'shutdown' }, error);
      console.error('Intercom could not stop its voice processes:', error);
      if (window && !window.isDestroyed()) window.webContents.send('voice:progress', { phase: 'error', message: error.message });
    });
  });
  window.on('closed', () => { window = undefined; });
}).catch(async (error) => {
  console.error('Intercom failed to start:', error);
  await diagnostics.record('app.failure', { component: 'startup' }, error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
