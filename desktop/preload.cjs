const { contextBridge, ipcRenderer } = require('electron');

const allowed = new Set(['state', 'toggle-floating', 'toggle-top', 'toggle-maximize', 'shrink-floating', 'grow-floating', 'minimize', 'close']);
contextBridge.exposeInMainWorld('intercom', {
  loadContextMesh: () => ipcRenderer.invoke('mesh:load'),
  workState: () => ipcRenderer.invoke('work:state'),
  workSessions: (contextId) => ipcRenderer.invoke('work:sessions', contextId),
  prepareWork: (...args) => ipcRenderer.invoke('work:prepare', ...args),
  confirmWork: (id) => ipcRenderer.invoke('work:confirm', id),
  approveWork: (...args) => ipcRenderer.invoke('work:approve', ...args),
  acknowledgeWork: (id) => ipcRenderer.invoke('work:acknowledge', id),
  cancelWork: (id) => ipcRenderer.invoke('work:cancel', id),
  onWorkProgress: (callback) => {
    const listener = (_event, job) => callback(job);
    ipcRenderer.on('work:progress', listener);
    return () => ipcRenderer.removeListener('work:progress', listener);
  },
  voiceSettings: () => ipcRenderer.invoke('voice:settings'),
  voiceProfiles: () => ipcRenderer.invoke('voice:profiles'),
  voiceCatalog: () => ipcRenderer.invoke('voice:voice-catalog'),
  saveVoiceProfile: (profile) => ipcRenderer.invoke('voice:save-profile', profile),
  activateVoiceProfile: (id) => ipcRenderer.invoke('voice:activate-profile', id),
  deleteVoiceProfile: (id) => ipcRenderer.invoke('voice:delete-profile', id),
  previewVoice: (text, profile) => ipcRenderer.invoke('voice:preview', text, profile),
  configureVoiceSession: (id, sessionId) => ipcRenderer.invoke('voice:configure', id, sessionId),
  transcribeVoice: (id, wave) => ipcRenderer.invoke('voice:transcribe', id, wave),
  sendVoicePrompt: (id, text) => ipcRenderer.invoke('voice:send', id, text),
  cancelVoice: (id) => ipcRenderer.invoke('voice:cancel', id),
  speakVoice: (text) => ipcRenderer.invoke('voice:speak', text),
  stopVoiceSpeech: () => ipcRenderer.invoke('voice:stop-speech'),
  onVoiceProgress(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('voice:progress', listener);
    return () => ipcRenderer.removeListener('voice:progress', listener);
  },
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
