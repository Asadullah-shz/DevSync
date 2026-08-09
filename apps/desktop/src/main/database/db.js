const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use app data directory for persistence, but for dev we use a temp dir or local dir
const dbDir = path.join(os.homedir(), '.devsync');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'devsync.db');
const db = new Database(dbPath, { verbose: console.log });

// Initialize database schema
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation_id TEXT,
      project_id TEXT,
      device_id TEXT,
      operation_type TEXT,
      path TEXT,
      hash TEXT,
      status TEXT DEFAULT 'PENDING',
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_attempt DATETIME,
      error TEXT
    );
  `);
  
  // Create an index to quickly find pending jobs
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status 
    ON sync_queue(status)
  `);
}

initDatabase();

module.exports = db;
