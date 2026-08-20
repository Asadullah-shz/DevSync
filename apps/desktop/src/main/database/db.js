const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use app data directory for persistence, but for dev we use a temp dir or local dir
const dbDir = path.join(os.homedir(), '.devsync');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'devsync.db');

let dbInstance = null;


async function initDatabase() {
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Optimize SQLite database parameters for RAM conservation and WAL performance
  await dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -1000;
  `);

  await dbInstance.exec(`
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
  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status 
    ON sync_queue(status)
  `);

  // Phase 4: Device Identity
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS device_identity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      private_key TEXT NOT NULL,
      public_key TEXT NOT NULL,
      device_id TEXT,
      registered_at DATETIME
    );
  `);

  // Phase 3/4: Auth Session
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS auth_session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL
    );
  `);

  // Phase 7: Local Projects
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS local_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      local_path TEXT NOT NULL,
      device_id TEXT NOT NULL,
      last_sync_cursor TEXT,
      sync_status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return dbInstance;
}

function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

module.exports = { initDatabase, getDb };
