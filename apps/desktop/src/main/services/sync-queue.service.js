const db = require('../database/db');
const crypto = require('crypto');

class SyncQueueService {
  constructor() {
    this.projectId = 'PRJ-MOCK'; // In a real app, this comes from the active project config
    this.deviceId = 'DEV-MOCK';  // In a real app, this is the registered device ID
    
    // Start background worker loop
    this.workerInterval = setInterval(() => this.processQueue(), 5000);
  }

  /**
   * Enqueue a new file mutation
   */
  enqueue(event) {
    const { type, path, hash } = event;
    const id = `SQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const opId = `OP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const stmt = db.prepare(`
      INSERT INTO sync_queue (
        id, operation_id, project_id, device_id, operation_type, path, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, opId, this.projectId, this.deviceId, type, path, hash || null);
    console.log(`[SYNC QUEUE] Enqueued ${type} operation for ${path}`);
  }

  /**
   * Process the queue by attempting to upload pending items
   */
  async processQueue() {
    // Get up to 10 pending operations
    const pendingOps = db.prepare(`
      SELECT * FROM sync_queue 
      WHERE status = 'PENDING' OR (status = 'FAILED' AND retry_count < 3)
      ORDER BY created_at ASC
      LIMIT 10
    `).all();

    if (pendingOps.length === 0) return;

    console.log(`[SYNC QUEUE] Processing ${pendingOps.length} pending operations...`);

    const updateStatus = db.prepare(`
      UPDATE sync_queue 
      SET status = ?, last_attempt = CURRENT_TIMESTAMP, retry_count = retry_count + 1, error = ? 
      WHERE id = ?
    `);

    for (const op of pendingOps) {
      try {
        // Here we would normally make HTTP requests to:
        // 1. POST /api/v1/storage/upload (if CREATE/MODIFY)
        // 2. POST /api/v1/sync/operations (with the operation payload)
        
        // Simulating network delay
        await new Promise(res => setTimeout(res, 200));

        // Mark as completed
        updateStatus.run('COMPLETED', null, op.id);
        console.log(`[SYNC QUEUE] Successfully processed ${op.id} (${op.operation_type} ${op.path})`);
      } catch (err) {
        console.error(`[SYNC QUEUE] Error processing ${op.id}:`, err);
        updateStatus.run('FAILED', err.message, op.id);
      }
    }
  }

  stop() {
    clearInterval(this.workerInterval);
  }
}

module.exports = new SyncQueueService();
