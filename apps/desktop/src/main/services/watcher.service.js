const chokidar = require('chokidar');
const path = require('path');
const { hashFile } = require('./hashing.service.js');

const syncQueue = require('./sync-queue.service');

class WatcherService {
  constructor() {
    this.watcher = null;
    this.watchedPath = null;
    this.onEventCallback = null;
    
    // Simple debounce map to prevent multiple triggers for a single save
    this.debounceTimeouts = new Map();
  }

  /**
   * Start watching a directory
   */
  startWatching(directoryPath, callback) {
    if (this.watcher) {
      this.stopWatching();
    }

    this.watchedPath = directoryPath;
    this.onEventCallback = callback;

    this.watcher = chokidar.watch(directoryPath, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**'
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', filePath => this.handleEvent('CREATE', filePath))
      .on('change', filePath => this.handleEvent('MODIFY', filePath))
      .on('unlink', filePath => this.handleEvent('DELETE', filePath))
      .on('error', error => console.error(`Watcher error: ${error}`));
      
    console.log(`Started watching: ${directoryPath}`);
  }

  /**
   * Stop watching
   */
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.watchedPath = null;
      console.log('Stopped watching directory');
    }
  }

  /**
   * Process the event and compute hash if necessary
   */
  async handleEvent(type, filePath) {
    // Debounce rapid events on the same file
    if (this.debounceTimeouts.has(filePath)) {
      clearTimeout(this.debounceTimeouts.get(filePath));
    }

    const timeout = setTimeout(async () => {
      this.debounceTimeouts.delete(filePath);
      
      try {
        const relativePath = path.relative(this.watchedPath, filePath).replace(/\\/g, '/');
        let hash = null;
        
        if (type === 'CREATE' || type === 'MODIFY') {
          hash = await hashFile(filePath);
        }

        console.log(`[WATCHER] ${type} - ${relativePath} (Hash: ${hash})`);
        
        const eventData = {
          type,
          path: relativePath,
          hash,
          timestamp: new Date().toISOString()
        };

        // Emit to Sync Queue for backend upload
        syncQueue.enqueue(eventData);

        // Emit to React UI via IPC
        if (this.onEventCallback) {
          this.onEventCallback(eventData);
        }
      } catch (err) {
        console.error(`Error processing file ${filePath}:`, err);
      }
    }, 100); // Small 100ms debounce since awaitWriteFinish already helps stabilize

    this.debounceTimeouts.set(filePath, timeout);
  }
}

module.exports = new WatcherService();
