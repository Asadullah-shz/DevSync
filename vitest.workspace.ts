import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'server',
      root: './apps/server',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
      testTimeout: 15000,
      env: {
        DATABASE_URL: 'mongodb://127.0.0.1:27017/devsync-test?replicaSet=rs0'
      }
    },
  },
  {
    test: {
      name: 'desktop',
      root: './apps/desktop',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  },
]);
