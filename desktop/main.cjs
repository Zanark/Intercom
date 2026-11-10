const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const profilePath = process.env.INTERCOM_PROFILE_DIR || path.join(app.getPath('appData'), 'IntercomPrototype');
app.setPath('userData', profilePath);

let window;
let fullBounds;
let floating = false;
let onTop = false;
const page = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const state = () => ({
  floating, onTop,
  paused: !!window && (window.isMinimized() || !window.isVisible()),
});

function publish() {
  window.webContents.send('window:state', state());
}

function setFloating(value) {
  if (floating === value) return state();
  if (window.isMaximized()) window.unmaximize();
  floating = value;
  if (floating) {
    fullBounds = window.getBounds();
    window.setMinimumSize(360, 360);
    const side = Math.min(540, fullBounds.width, fullBounds.height);
    window.setBounds({
      x: fullBounds.x + Math.round((fullBounds.width - side) / 2),
      y: fullBounds.y + Math.round((fullBounds.height - side) / 2),
      width: side,
      height: side,
    });
  } else {
    window.setMinimumSize(960, 680);
    if (fullBounds) window.setBounds(fullBounds);
  }
  publish();
  return state();
}

function requireOwnFrame(event) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });
  for (const event of ['minimize', 'restore', 'show', 'hide']) window.on(event, publish);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && ((input.key === 'Escape' && floating) || (input.control && input.shift && input.key.toLowerCase() === 'm'))) {
      event.preventDefault();
      setFloating(input.key === 'Escape' ? false : !floating);
    }
  });
  ipcMain.handle('window:action', (event, action) => {
    requireOwnFrame(event);
    switch (action) {
      case 'state': return state();
      case 'toggle-floating': return setFloating(!floating);
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
  const ready = new Promise((resolve) => window.once('ready-to-show', resolve));
  await window.loadURL(page);
  await ready;
  window.show();
  window.on('closed', () => { window = undefined; });
}).catch((error) => {
  console.error('Intercom failed to start:', error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
