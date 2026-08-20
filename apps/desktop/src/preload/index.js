const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  startWatching: (projectId, folderPath) => ipcRenderer.send('watcher:start', projectId, folderPath),
  stopWatching: () => ipcRenderer.send('watcher:stop'),
  onWatcherEvent: (callback) => ipcRenderer.on('watcher:event', (_event, value) => callback(value)),
  removeWatcherEvent: () => ipcRenderer.removeAllListeners('watcher:event'),

  getStatus: () => ipcRenderer.invoke('device:getStatus'),
  login: (email, password) => ipcRenderer.invoke('auth:login', email, password),
  registerDevice: () => ipcRenderer.invoke('device:register'),

  // Tray / sync state
  setTrayStatus: (status) => ipcRenderer.invoke('tray:updateStatus', status),
  getTrayPaused: () => ipcRenderer.invoke('tray:getSyncPaused'),
  onSyncPaused: (callback) => ipcRenderer.on('sync:setPaused', (_e, paused) => callback(paused)),
  onTrayOpenConflicts: (callback) => ipcRenderer.on('tray:openConflicts', callback),
  onTrayOpenHistory:   (callback) => ipcRenderer.on('tray:openHistory',   callback),
  onTrayOpenDevices:   (callback) => ipcRenderer.on('tray:openDevices',   callback),

  // Mass-delete recovery
  onMassDeleteWarning: (callback) => ipcRenderer.on('watcher:massDeleteWarning', (_e, count) => callback(count)),
  resumeAfterMassDelete: () => ipcRenderer.invoke('sync:resumeAfterMassDelete'),
  discardMassDelete: () => ipcRenderer.invoke('sync:discardMassDelete'),

  // Project API
  getWorkspaces: () => ipcRenderer.invoke('api:getWorkspaces'),
  createWorkspace: (name) => ipcRenderer.invoke('api:createWorkspace', name),
  getProjects: () => ipcRenderer.invoke('api:getProjects'),
  createProject: (name, workspaceId, localPath) => ipcRenderer.invoke('api:createProject', name, workspaceId, localPath),
  getLocalProjects: () => ipcRenderer.invoke('db:getLocalProjects'),

  // History & Restore
  getProjectHistory: (projectId) => ipcRenderer.invoke('api:getProjectHistory', projectId),
  restoreFile: (projectId, hash, relativePath) => ipcRenderer.invoke('api:restoreFile', projectId, hash, relativePath),
  getDeletedFiles: (projectId) => ipcRenderer.invoke('api:getDeletedFiles', projectId),
  restoreDeletedFile: (projectId, fileId) => ipcRenderer.invoke('api:restoreDeletedFile', projectId, fileId),

  // Conflicts
  getConflicts: (projectId) => ipcRenderer.invoke('api:getConflicts', projectId),
  resolveConflict: (projectId, conflictId, resolution) => ipcRenderer.invoke('api:resolveConflict', projectId, conflictId, resolution),

  // Devices
  getDevices: () => ipcRenderer.invoke('api:getDevices'),
  revokeDevice: (deviceId) => ipcRenderer.invoke('api:revokeDevice', deviceId),

  // Storage Health
  verifyStorage: () => ipcRenderer.invoke('api:verifyStorage'),
  getStorageStats: () => ipcRenderer.invoke('api:getStorageStats')
});
