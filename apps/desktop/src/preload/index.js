const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  startWatching: (folderPath) => ipcRenderer.send('watcher:start', folderPath),
  stopWatching: () => ipcRenderer.send('watcher:stop'),
  onWatcherEvent: (callback) => ipcRenderer.on('watcher:event', (_event, value) => callback(value)),
  removeWatcherEvent: () => ipcRenderer.removeAllListeners('watcher:event')
});
