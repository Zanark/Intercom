const { contextBridge, ipcRenderer } = require('electron');

const allowed = new Set(['state', 'toggle-floating', 'toggle-top', 'minimize', 'close']);
contextBridge.exposeInMainWorld('intercom', {
  windowAction(action) {
    if (!allowed.has(action)) return Promise.reject(new Error('Unsupported window action.'));
    return ipcRenderer.invoke('window:action', action);
  },
  onWindowState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
});
