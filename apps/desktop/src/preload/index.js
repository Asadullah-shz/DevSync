const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  startWatching: (projectId, folderPath) => ipcRenderer.send('watcher:start', projectId, folderPath),
  stopWatching: () => ipcRenderer.send('watcher:stop'),
  onWatcherEvent: (callback) => ipcRenderer.on('watcher:event', (_event, value) => callback(value)),
  removeWatcherEvent: () => ipcRenderer.removeAllListeners('watcher:event'),

  getStatus: () => ipcRenderer.invoke('device:getStatus'),
  login: (email, password) => ipcRenderer.invoke('auth:login', email, password),
  startSSOLogin: (provider) => ipcRenderer.invoke('auth:sso', provider),
  registerDevice: () => ipcRenderer.invoke('device:register'),


  setTrayStatus: (status) => ipcRenderer.invoke('tray:updateStatus', status),
  getTrayPaused: () => ipcRenderer.invoke('tray:getSyncPaused'),
  onSyncPaused: (callback) => ipcRenderer.on('sync:setPaused', (_e, paused) => callback(paused)),
  onDevicePendingApproval: (callback) => ipcRenderer.on('sync:devicePendingApproval', callback),
  onTrayOpenConflicts: (callback) => ipcRenderer.on('tray:openConflicts', callback),
  onTrayOpenHistory:   (callback) => ipcRenderer.on('tray:openHistory',   callback),
  onTrayOpenDevices:   (callback) => ipcRenderer.on('tray:openDevices',   callback),


  onMassDeleteWarning: (callback) => ipcRenderer.on('watcher:massDeleteWarning', (_e, count) => callback(count)),
  resumeAfterMassDelete: () => ipcRenderer.invoke('sync:resumeAfterMassDelete'),
  discardMassDelete: () => ipcRenderer.invoke('sync:discardMassDelete'),


  getWorkspaces: () => ipcRenderer.invoke('api:getWorkspaces'),
  createWorkspace: (name) => ipcRenderer.invoke('api:createWorkspace', name),
  addWorkspaceMember: (workspaceId, email, role) => ipcRenderer.invoke('api:addWorkspaceMember', workspaceId, email, role),
  updateWorkspaceMemberRole: (workspaceId, userId, role) => ipcRenderer.invoke('api:updateWorkspaceMemberRole', workspaceId, userId, role),
  removeWorkspaceMember: (workspaceId, userId) => ipcRenderer.invoke('api:removeWorkspaceMember', workspaceId, userId),
  updateWorkspacePolicies: (workspaceId, policies) => ipcRenderer.invoke('api:updateWorkspacePolicies', workspaceId, policies),
  getProjects: () => ipcRenderer.invoke('api:getProjects'),
  createProject: (name, workspaceId, localPath) => ipcRenderer.invoke('api:createProject', name, workspaceId, localPath),
  getLocalProjects: () => ipcRenderer.invoke('db:getLocalProjects'),


  getProjectHistory: (projectId) => ipcRenderer.invoke('api:getProjectHistory', projectId),
  restoreFile: (projectId, hash, relativePath) => ipcRenderer.invoke('api:restoreFile', projectId, hash, relativePath),
  getDeletedFiles: (projectId) => ipcRenderer.invoke('api:getDeletedFiles', projectId),
  restoreDeletedFile: (projectId, fileId) => ipcRenderer.invoke('api:restoreDeletedFile', projectId, fileId),


  getGlobalAuditLogs: () => ipcRenderer.invoke('api:getGlobalAuditLogs'),
  getProjectAuditLogs: (projectId) => ipcRenderer.invoke('api:getProjectAuditLogs', projectId),


  getConflicts: (projectId) => ipcRenderer.invoke('api:getConflicts', projectId),
  resolveConflict: (projectId, conflictId, resolution) => ipcRenderer.invoke('api:resolveConflict', projectId, conflictId, resolution),


  getDevices: () => ipcRenderer.invoke('api:getDevices'),
  revokeDevice: (deviceId) => ipcRenderer.invoke('api:revokeDevice', deviceId),


  verifyStorage: () => ipcRenderer.invoke('api:verifyStorage'),
  getStorageStats: () => ipcRenderer.invoke('api:getStorageStats')
});
