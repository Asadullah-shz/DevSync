import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15000,
    env: {
      DATABASE_URL: 'mongodb://127.0.0.1:27017/devsync-test?replicaSet=rs0'
    }
  }
});
