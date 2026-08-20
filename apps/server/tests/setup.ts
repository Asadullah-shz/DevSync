import { beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '../src/database/db.js';

// Define a test-specific environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_SECRET = 'test-refresh-secret';

const cleanDb = async () => {
  const collections = [
    'User', 'Session', 'Device', 'DeviceKey', 'Workspace', 'WorkspaceMember',
    'Project', 'ProjectDevice', 'File', 'FileVersion', 'Snapshot', 'SnapshotFile',
    'SyncOperation', 'Conflict', 'BackupJob', 'AuditLog'
  ];

  for (const model of collections) {
    try {
      await (db as any)[model[0].toLowerCase() + model.slice(1)].deleteMany();
    } catch (err) {
      console.warn(`Failed to clean model ${model}`);
    }
  }
};

beforeAll(async () => {
  await cleanDb();
});

afterAll(async () => {
  await db.$disconnect();
});

afterEach(async () => {
  await cleanDb();
});
