const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { getDb } = require('../database/db');
const apiService = require('./api.service');
const hashService = require('./hash.service');
const deviceService = require('./device.service');

class SyncQueueService {
  constructor() {
    this.workerInterval = setInterval(() => this.processQueue(), 5000);
    this.activeOperations = 0;
    this.MAX_CONCURRENT = 3; 
  }


  async enqueue(projectId, event) {
    const { type, filePath } = event;
    const id = `SQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const opId = `OP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const db = getDb();
    const project = await db.get('SELECT * FROM local_projects WHERE project_id = ?', [projectId]);
    if (!project) return;
    

    const relPath = path.relative(project.local_path, filePath).replace(/\\/g, '/');

    await db.run(`
      INSERT INTO sync_queue (
        id, operation_id, project_id, device_id, operation_type, path, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, opId, projectId, project.device_id, type, relPath, null]);
    
    console.log(`[SYNC QUEUE] Enqueued ${type} operation for ${relPath}`);
  }

 
  async processQueue() {
    let db;
    try {
      db = getDb();
    } catch (e) {
      return; 
    }

    const pendingOps = await db.all(`
      SELECT * FROM sync_queue 
      WHERE status = 'PENDING' OR (status = 'FAILED' AND retry_count < 3)
      ORDER BY created_at ASC
      LIMIT 10
    `);

    if (!pendingOps || pendingOps.length === 0) return;

    // Respect concurrency limit — don't pile up more work if already busy
    if (this.activeOperations >= this.MAX_CONCURRENT) {
      console.log(`[SYNC QUEUE] Concurrency limit reached (${this.activeOperations}/${this.MAX_CONCURRENT}), deferring.`);
      return;
    }

    console.log(`[SYNC QUEUE] Processing ${pendingOps.length} pending operations...`);
    

    const projectOps = {};
    for (const op of pendingOps) {
      if (!projectOps[op.project_id]) projectOps[op.project_id] = [];
      projectOps[op.project_id].push(op);
    }

    for (const [projectId, ops] of Object.entries(projectOps)) {
      const project = await db.get('SELECT * FROM local_projects WHERE project_id = ?', [projectId]);
      if (!project) continue;

      const deviceIdentity = await deviceService.getIdentity();
      if (!deviceIdentity || !deviceIdentity.device_id) continue;

      const batchPayload = [];

      for (const op of ops) {
        try {
          const absPath = path.join(project.local_path, op.path);
          let hash = null;
          let size = undefined;

          if (op.operation_type === 'CREATE' || op.operation_type === 'MODIFY') {
            const stats = await fs.stat(absPath);
            size = stats.size;
            hash = await hashService.hashFile(absPath);
            
            const CHUNK_SIZE = 5 * 1024 * 1024; 
            if (size <= CHUNK_SIZE) {
              await apiService.uploadFile('/storage/upload', absPath);
            } else {
              const uploadId = `UP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
              const totalChunks = Math.ceil(size / CHUNK_SIZE);
              console.log(`[SYNC QUEUE] File too large (${size} bytes). Uploading in ${totalChunks} chunks...`);
              
              for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, size);
                await apiService.uploadChunk('/storage/upload/chunk', absPath, uploadId, i, start, end);
                console.log(`[SYNC QUEUE] Uploaded chunk ${i + 1}/${totalChunks} for ${op.path}`);
              }
              
              const completeRes = await apiService.completeChunkUpload('/storage/upload/complete', uploadId, totalChunks);
              if (completeRes.hash !== hash) {
                 console.warn(`[SYNC QUEUE] Hash mismatch after chunked upload! Local: ${hash}, Server: ${completeRes.hash}`);
              }
            }
          }

          batchPayload.push({
            type: op.operation_type,
            path: op.path,
            hash,
            size,
            timestamp: new Date().toISOString()
          });

        } catch (err) {
          console.error(`[SYNC QUEUE] Error preparing ${op.id}:`, err);
          await db.run(`
            UPDATE sync_queue 
            SET status = ?, last_attempt = CURRENT_TIMESTAMP, retry_count = retry_count + 1, error = ? 
            WHERE id = ?
          `, ['FAILED', err.message, op.id]);
        }
      }

      if (batchPayload.length === 0) continue;

      try {
        this.activeOperations++;
        await apiService.request(`/sync/${projectId}/operations`, {
          method: 'POST',
          body: JSON.stringify({
            deviceId: deviceIdentity.device_id,
            clientCursor: project.last_sync_cursor || undefined,
            operations: batchPayload
          })
        });


        for (const op of ops) {
          await db.run(`
            UPDATE sync_queue 
            SET status = ?, last_attempt = CURRENT_TIMESTAMP, error = NULL 
            WHERE id = ?
          `, ['COMPLETED', op.id]);
          console.log(`[SYNC QUEUE] Successfully processed ${op.id} (${op.operation_type} ${op.path})`);
        }
      } catch (err) {
        console.error(`[SYNC QUEUE] Failed to push operations to server:`, err);
        if (err.message && err.message.includes('Device requires admin approval')) {
          const { BrowserWindow } = require('electron');
          const windows = BrowserWindow.getAllWindows();
          if (windows.length > 0) {
            windows[0].webContents.send('sync:devicePendingApproval');
          }
        }
        for (const op of ops) {
           await db.run(`
            UPDATE sync_queue 
            SET status = ?, last_attempt = CURRENT_TIMESTAMP, retry_count = retry_count + 1, error = ? 
            WHERE id = ?
          `, ['FAILED', err.message, op.id]);
        }
      } finally {
        this.activeOperations = Math.max(0, this.activeOperations - 1);
      }
    }
  }

  async pullOperations(projectId) {
    let db;
    try {
      db = getDb();
    } catch (e) {
      return; 
    }

    const project = await db.get('SELECT * FROM local_projects WHERE project_id = ?', [projectId]);
    if (!project) return;

    const deviceIdentity = await deviceService.getIdentity();
    if (!deviceIdentity) return;

    try {
      let endpoint = `/sync/${projectId}/operations`;
      if (project.last_sync_cursor) {
        endpoint += `?after=${encodeURIComponent(project.last_sync_cursor)}`;
      }

      const res = await apiService.request(endpoint);
      if (!res.operations || res.operations.length === 0) return;

      const watcherService = require('./watcher.service');

      let lastTimestamp = project.last_sync_cursor;

      for (const op of res.operations) {
        // Skip operations originating from this very device
        if (op.deviceId === deviceIdentity.device_id) {
          lastTimestamp = op.createdAt;
          continue;
        }

        const absPath = path.join(project.local_path, op.path);
        
        // Ignore this file change in the watcher so we don't upload what we just downloaded
        watcherService.ignoreNextEvent(absPath);

        try {
          if (op.type === 'CREATE' || op.type === 'MODIFY') {
            if (op.hash) {
              await apiService.downloadFile(`/storage/download/${op.hash}`, absPath);
              console.log(`[SYNC PULL] Downloaded ${op.path} (Hash: ${op.hash})`);
            }
          } else if (op.type === 'DELETE') {
            try {
              await fs.unlink(absPath);
              console.log(`[SYNC PULL] Deleted ${op.path}`);
            } catch (e) {
              // Ignore if already deleted
            }
          }
        } catch (err) {
          console.error(`[SYNC PULL] Failed to apply operation ${op.id}:`, err);
        }

        lastTimestamp = op.createdAt;
      }

      // Update cursor
      if (lastTimestamp) {
        await db.run('UPDATE local_projects SET last_sync_cursor = ? WHERE project_id = ?', [lastTimestamp, projectId]);
      }

    } catch (err) {
      console.error(`[SYNC PULL] Failed to pull operations for ${projectId}:`, err);
    }
  }

  stop() {
    clearInterval(this.workerInterval);
  }
}

module.exports = new SyncQueueService();
