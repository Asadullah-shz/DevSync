import { Command } from 'commander';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';
import crypto from 'crypto';

const CONFIG_PATH = path.join(os.homedir(), '.devsync_config.json');
const program = new Command();

interface Config {
  apiUrl: string;
  token?: string;
  deviceId?: string;
}

function loadConfig(): Config {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {

    }
  }
  return { apiUrl: 'http://localhost:3000' };
}

function saveConfig(config: Config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

program
  .name('devsync')
  .description('DevSync Headless CLI Client')
  .version('1.0.0');

program
  .command('login')
  .description('Login to DevSync server')
  .argument('<email>', 'user email')
  .argument('<password>', 'user password')
  .option('-u, --url <url>', 'Server API URL', 'http://localhost:3000')
  .action(async (email, password, options) => {
    const config = loadConfig();
    config.apiUrl = options.url;

    try {
      console.log(`Connecting to ${config.apiUrl}...`);
      const res = await axios.post(`${config.apiUrl}/api/v1/auth/login`, { email, password });

      if (res.data && res.data.accessToken) {
        config.token = res.data.accessToken;


        if (!config.deviceId) {
          config.deviceId = `CLI-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        }

        saveConfig(config);
        console.log(`Login successful! Device ID registered: ${config.deviceId}`);
      } else {
        console.error('Invalid server response');
      }
    } catch (err: any) {
      console.error('Login failed:', err.response?.data?.error?.message || err.message);
    }
  });

program
  .command('start')
  .description('Start headless sync watcher for a project')
  .argument('<projectId>', 'DevSync Project ID')
  .argument('<folderPath>', 'Local folder path to synchronize')
  .action(async (projectId, folderPath) => {
    const config = loadConfig();
    if (!config.token) {
      console.error('Not logged in. Please run: devsync login <email> <password>');
      process.exit(1);
    }

    const absolutePath = path.resolve(folderPath);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Local path does not exist: ${absolutePath}`);
      process.exit(1);
    }

    console.log(`Starting sync engine...`);
    console.log(`Local Path: ${absolutePath}`);
    console.log(`Device ID: ${config.deviceId}`);


    const api = axios.create({
      baseURL: config.apiUrl,
      headers: { Authorization: `Bearer ${config.token}` }
    });


    try {
      await api.get(`/api/v1/projects`);
      console.log('Successfully authenticated with DevSync server.');
    } catch (err: any) {
      console.error('Failed to authenticate or fetch projects:', err.response?.data?.error?.message || err.message);
      process.exit(1);
    }


    const watcher = chokidar.watch(absolutePath, {
      ignored: [/(^|[\/\\])\../, '**/node_modules/**', '**/.git/**'],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: true
    });

    let pendingOps: any[] = [];
    let isProcessing = false;


    const processQueue = async () => {
      if (pendingOps.length === 0 || isProcessing) return;
      isProcessing = true;

      const batch = [...pendingOps];
      pendingOps = [];

      try {
        console.log(`[SYNC] Pushing ${batch.length} change(s) to server...`);
        const payload = {
          deviceId: config.deviceId,
          operations: batch.map(op => ({
            type: op.type,
            path: op.path,
            hash: op.hash,
            size: op.size,
            timestamp: new Date().toISOString()
          }))
        };

        await api.post(`/api/v1/sync/${projectId}/operations`, payload);
        console.log(`[SYNC] Pushed changes successfully.`);
      } catch (err: any) {
        console.error('[SYNC] Failed to push operations:', err.response?.data?.error?.message || err.message);

        pendingOps.unshift(...batch);
      } finally {
        isProcessing = false;
      }
    };

    const handleWatcherEvent = async (type: 'CREATE' | 'MODIFY' | 'DELETE', filePath: string) => {
      const relPath = path.relative(absolutePath, filePath).replace(/\\/g, '/');
      console.log(`[WATCHER] Detected ${type} on ${relPath}`);

      let hash = undefined;
      let size = 0;

      if (type !== 'DELETE') {
        try {
          const stats = fs.statSync(filePath);
          size = stats.size;

          hash = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');


          const fileData = fs.readFileSync(filePath);
          await api.post('/api/v1/storage/upload', fileData, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-file-path': relPath
            }
          });
        } catch (e: any) {
          console.error(`[WATCHER] Error reading file: ${e.message}`);
          return;
        }
      }

      pendingOps.push({ type, path: relPath, hash, size });
      setTimeout(processQueue, 3000);
    };

    watcher
      .on('add', (p) => handleWatcherEvent('CREATE', p))
      .on('change', (p) => handleWatcherEvent('MODIFY', p))
      .on('unlink', (p) => handleWatcherEvent('DELETE', p));


    setInterval(async () => {
      try {
        const res = await api.get(`/api/v1/sync/${projectId}/operations`);
        if (res.data.operations && res.data.operations.length > 0) {
          console.log(`[SYNC PULL] Pulled ${res.data.operations.length} new operations.`);

        }
      } catch (err: any) {
        console.error('[SYNC PULL] Error pulling changes:', err.message);
      }
    }, 10000);

    console.log('Sync engine running. Press Ctrl+C to exit.');
  });

program.parse();
