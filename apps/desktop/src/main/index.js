const { app, BrowserWindow, dialog, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const db = require('./database/db');


app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192 --gc-interval=100');
app.disableHardwareAcceleration();

let tray;
let syncPaused = false;
let currentTrayStatus = 'SYNCED';

const TRAY_STATUS_LABELS = {
  SYNCED:   '✓  DevSync — All synced',
  SYNCING:  '⟳  DevSync — Syncing...',
  CONFLICT: '⚠  DevSync — Conflict detected',
  OFFLINE:  '✕  DevSync — Offline',
};

const TRAY_TOOLTIPS = {
  SYNCED:   'DevSync — All files synced',
  SYNCING:  'DevSync — Syncing files...',
  CONFLICT: 'DevSync — Conflict needs attention',
  OFFLINE:  'DevSync — Cannot reach server',
};

function openAndSend(channel) {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send(channel);
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const statusLabel = TRAY_STATUS_LABELS[currentTrayStatus] || 'DevSync';
  tray.setToolTip(TRAY_TOOLTIPS[currentTrayStatus] || 'DevSync');

  const contextMenu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Open DevSync', click: () => { if (mainWindow) mainWindow.show(); } },
    {
      label: syncPaused ? '▶  Resume Sync' : '⏸  Pause Sync',
      click: () => {
        syncPaused = !syncPaused;
        if (mainWindow) mainWindow.webContents.send('sync:setPaused', syncPaused);
        rebuildTrayMenu();
      }
    },
    { type: 'separator' },
    { label: 'View Conflicts',  click: () => openAndSend('tray:openConflicts') },
    { label: 'View History',    click: () => openAndSend('tray:openHistory') },
    { label: 'View Devices',    click: () => openAndSend('tray:openDevices') },
    { type: 'separator' },
    { label: 'Quit DevSync', click: () => { app.isQuiting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
}

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

    backgroundColor: '#0a0a0c',
  });


  if (process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools();
  } else {

    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }


  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {

  const base64Icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const icon = nativeImage.createFromDataURL(base64Icon);

  tray = new Tray(icon);
  rebuildTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

app.whenReady().then(async () => {
  try {

    await db.initDatabase();
    console.log('[MAIN] Database initialized');


    const deviceService = require('./services/device.service');
    await deviceService.initIdentity();
    console.log('[MAIN] Device Identity initialized');

    const apiService = require('./services/api.service');
    const session = await apiService.getSession();
    if (session && session.token) {
      const socketService = require('./services/socket.service');
      socketService.connect(session.token);
      console.log('[MAIN] Socket service initialized');
    }
  } catch (err) {
    console.error('[MAIN] Startup error:', err);
  }

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {


});

const watcherService = require('./services/watcher.service');


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


ipcMain.on('watcher:start', (event, projectId, folderPath) => {
  watcherService.startWatching(projectId, folderPath, (fileEvent) => {
    if (mainWindow) {
      mainWindow.webContents.send('watcher:event', fileEvent);
    }
  });


  watcherService.onMassDeleteWarning((count) => {
    currentTrayStatus = 'CONFLICT';
    rebuildTrayMenu();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('watcher:massDeleteWarning', count);
    }
  });
});


ipcMain.on('watcher:stop', () => {
  watcherService.stopWatching();
});


ipcMain.handle('sync:resumeAfterMassDelete', () => {
  watcherService.flushPendingDeletes();
  currentTrayStatus = 'SYNCING';
  rebuildTrayMenu();

  setTimeout(() => {
    if (currentTrayStatus === 'SYNCING') {
      currentTrayStatus = 'SYNCED';
      rebuildTrayMenu();
    }
  }, 10000);
  return { success: true };
});

ipcMain.handle('sync:discardMassDelete', () => {
  watcherService.discardPendingDeletes();
  currentTrayStatus = 'SYNCED';
  rebuildTrayMenu();
  return { success: true };
});


ipcMain.handle('tray:updateStatus', (event, status) => {
  currentTrayStatus = status;
  rebuildTrayMenu();
  return { success: true };
});

ipcMain.handle('tray:getSyncPaused', () => {
  return { paused: syncPaused };
});

ipcMain.handle('device:getStatus', async () => {
  const deviceService = require('./services/device.service');
  const apiService = require('./services/api.service');

  const identity = await deviceService.getIdentity();
  const session = await apiService.getSession();
  return {
    isLoggedIn: !!session,
    isRegistered: !!(identity && identity.device_id),
    deviceId: identity ? identity.device_id : null,
    user: session ? { email: session.email } : null
  };
});



let ssoServer = null;

ipcMain.handle('auth:sso', async (event, provider) => {
  return new Promise((resolve) => {

    if (ssoServer) {
      ssoServer.close();
    }

    ssoServer = http.createServer((req, res) => {


      const url = new URL(req.url, 'http://localhost:13337');
      const accessToken = url.searchParams.get('accessToken');
      const refreshToken = url.searchParams.get('refreshToken');

      if (accessToken && refreshToken) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>SSO Successful</h1><p>You can close this window and return to DevSync.</p><script>window.close()</script></body></html>');


        const mockUser = {
          id: 'SSO-USER',
          email: 'sso@example.com',
          name: 'SSO User'
        };

        resolve({ success: true, user: mockUser, accessToken, refreshToken });
        ssoServer.close();
        ssoServer = null;

        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing tokens');
      }
    });

    ssoServer.listen(13337, () => {



      shell.openExternal(`http://localhost:3000/api/v1/auth/${provider}?desktop=true`);
    });


    setTimeout(() => {
      if (ssoServer) {
        ssoServer.close();
        ssoServer = null;
        resolve({ success: false, error: 'SSO timed out' });
      }
    }, 5 * 60 * 1000);
  });
});

ipcMain.handle('auth:login', async (event, email, password) => {
  const apiService = require('./services/api.service');
  const deviceService = require('./services/device.service');
  try {
    const identity = await deviceService.getIdentity();
    const data = await apiService.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceId: identity ? identity.device_id : undefined })
    });
    await apiService.saveSession(data.accessToken, data.user);

    const socketService = require('./services/socket.service');
    socketService.connect(data.accessToken);

    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('device:register', async () => {
  const deviceService = require('./services/device.service');
  const apiService = require('./services/api.service');
  try {
    const identity = await deviceService.getIdentity();
    const deviceInfo = deviceService.getDeviceInfo();

    const data = await apiService.request('/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        ...deviceInfo,
        publicKey: identity.public_key
      })
    });

    await deviceService.setRegisteredDeviceId(data.device.id);
    return { success: true, deviceId: data.device.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('api:getDevices', async () => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/devices');
    return { success: true, devices: data.devices };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:revokeDevice', async (event, deviceId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/devices/${deviceId}/revoke`, {
      method: 'POST'
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('api:verifyStorage', async () => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/storage/verify', { method: 'POST' });
    return { success: true, result: data.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:getStorageStats', async () => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/storage/stats');
    return { success: true, stats: data.stats };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('api:getWorkspaces', async () => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/workspaces');
    return { success: true, workspaces: data.workspaces };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:createWorkspace', async (event, name) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return { success: true, workspace: data.workspace };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:addWorkspaceMember', async (event, workspaceId, email, role) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
    return { success: true, member: data.member };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:updateWorkspaceMemberRole', async (event, workspaceId, userId, role) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
    return { success: true, member: data.member };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:removeWorkspaceMember', async (event, workspaceId, userId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE'
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:updateWorkspacePolicies', async (event, workspaceId, policies) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.updateWorkspacePolicies(workspaceId, policies);
    return { success: true, workspace: data.workspace };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('api:getProjects', async () => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/projects');
    return { success: true, projects: data.projects };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:createProject', async (event, name, workspaceId, localPath) => {
  const apiService = require('./services/api.service');
  const deviceService = require('./services/device.service');
  try {

    const data = await apiService.request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, workspaceId })
    });


    const identity = await deviceService.getIdentity();
    await db.getDb().run(
      'INSERT INTO local_projects (project_id, local_path, device_id) VALUES (?, ?, ?)',
      [data.project.id, localPath, identity.device_id]
    );

    const socketService = require('./services/socket.service');
    socketService.subscribeToProject(data.project.id);

    return { success: true, project: data.project };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:getLocalProjects', async () => {
  try {
    const localProjects = await db.getDb().all('SELECT * FROM local_projects');
    return { success: true, localProjects };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('api:getProjectHistory', async (event, projectId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/versions/${projectId}/versions`);
    return { success: true, history: data.history };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('api:getGlobalAuditLogs', async () => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request('/audit');
    return { success: true, logs: data.logs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:getProjectAuditLogs', async (event, projectId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/audit/project/${projectId}`);
    return { success: true, logs: data.logs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:restoreFile', async (event, projectId, hash, relativePath) => {
  const apiService = require('./services/api.service');
  const watcherService = require('./services/watcher.service');
  const path = require('path');

  try {
    const localProject = await db.getDb().get('SELECT * FROM local_projects WHERE project_id = ?', [projectId]);
    if (!localProject) throw new Error('Local project not found');

    const absPath = path.join(localProject.local_path, relativePath);





    await apiService.downloadFile(`/storage/download/${hash}`, absPath);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:getDeletedFiles', async (event, projectId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/versions/${projectId}/deleted`);
    return { success: true, files: data.files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:restoreDeletedFile', async (event, projectId, fileId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/versions/${projectId}/files/${fileId}/restore`, {
      method: 'POST'
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:getConflicts', async (event, projectId) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/sync/${projectId}/conflicts`);
    return { success: true, conflicts: data.conflicts };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('api:resolveConflict', async (event, projectId, conflictId, resolution) => {
  const apiService = require('./services/api.service');
  try {
    const data = await apiService.request(`/sync/${projectId}/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution })
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
