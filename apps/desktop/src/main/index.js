const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Matches the dark theme
    backgroundColor: '#0a0a0c',
  });

  // Check if we are in dev mode (Vite running)
  const isDev = process.argv.includes('--dev');
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const watcherService = require('./services/watcher.service');

// IPC handler for selecting a local directory
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

// IPC handler for starting the file watcher
ipcMain.on('watcher:start', (event, folderPath) => {
  watcherService.startWatching(folderPath, (fileEvent) => {
    // Send file event to the renderer process
    if (mainWindow) {
      mainWindow.webContents.send('watcher:event', fileEvent);
    }
  });
});

// IPC handler for stopping the file watcher
ipcMain.on('watcher:stop', () => {
  watcherService.stopWatching();
});
