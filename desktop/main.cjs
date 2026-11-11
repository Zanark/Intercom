const { app, BrowserWindow, ipcMain, Menu, session, Notification, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { VoiceHost } = require('./services/voice.cjs');
const { loadMesh } = require('./services/mesh.cjs');
const { WorkHost } = require('./services/work.cjs');

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
const page = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const state = () => ({
  floating, onTop,
  floatingSize: floatingSize(),
  maximized: !!window && window.isMaximized(),
  paused: !!window && (window.isMinimized() || !window.isVisible()),
});
const voice = new VoiceHost(profilePath, (event) => {
  if (window && !window.isDestroyed()) window.webContents.send('voice:progress', event);
});
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
}, { assertAvailable: (id) => {
  if (voice.work?.sessionId === id) throw new Error('That session is already owned by an Intercom conversation. Wait or cancel it first.');
} });
voice.assertAvailable = (id) => {
  if (work.active?.sessionId === id) throw new Error('That session is already owned by Intercom work. Choose a different idle conversation session or wait.');
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
  ipcMain.handle('window:action', (event, action) => {
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
  ipcMain.handle('mesh:load', (event) => {
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
    ipcMain.handle(`work:${action}`, (event, ...args) => { requireOwnFrame(event); return handler(...args); });
  }
  const voiceHandlers = {
    settings: () => voice.settings(),
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
    ipcMain.handle(`voice:${action}`, (event, ...args) => { requireOwnFrame(event); return handler(...args); });
  }
  const ready = new Promise((resolve) => window.once('ready-to-show', resolve));
  await window.loadURL(page);
  await ready;
  window.show();
  window.on('close', (event) => {
    event.preventDefault();
    void Promise.all([voice.close(), work.close()]).then(() => window?.destroy()).catch((error) => {
      console.error('Intercom could not stop its voice processes:', error);
      if (window && !window.isDestroyed()) window.webContents.send('voice:progress', { phase: 'error', message: error.message });
    });
  });
  window.on('closed', () => { window = undefined; });
}).catch((error) => {
  console.error('Intercom failed to start:', error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
