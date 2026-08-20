const { io } = require('socket.io-client');
const { getDb } = require('../database/db');
const syncQueue = require('./sync-queue.service');

class SocketService {
  constructor() {
    this.socket = null;
    this.token = null;
  }

  connect(token) {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.token = token;
    
    const apiService = require('./api.service');
    const serverUrl = apiService.getServerUrl();
  
    this.socket = io(serverUrl, {
      auth: {   
        token: this.token
      }
    });

    this.socket.on('connect', async () => {
      console.log(`[SOCKET] Connected to DevSync backend: ${this.socket.id}`);
      
      try {
        const db = getDb();
        const localProjects = await db.all('SELECT * FROM local_projects');
        for (const lp of localProjects) {
          this.socket.emit('subscribeToProject', lp.project_id);
          console.log(`[SOCKET] Subscribed to project updates for: ${lp.project_id}`);
        }
      } catch (err) {
        console.error('[SOCKET] Failed to fetch local projects for subscription:', err);
      }
    });

    this.socket.on('PROJECT_UPDATED', (data) => {
      console.log(`[SOCKET] Remote change detected on project ${data.projectId} by device ${data.deviceId}`);
      syncQueue.pullOperations(data.projectId);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[SOCKET] Connection error:', err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  subscribeToProject(projectId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribeToProject', projectId);
    }
  }
}

module.exports = new SocketService();
