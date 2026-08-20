const chokidar = require('chokidar');
const path = require('path');
const hashService = require('./hash.service.js');
const syncQueue = require('./sync-queue.service');

// How many DELETE events in one 3-second window triggers a mass-delete warning
const MASS_DELETE_THRESHOLD = 10;

class WatcherService {
  constructor() {
    this.watcher = null;
    this.watchedPath = null;
    this.projectId = null;
    this.onEventCallback = null;

    this.debounceTimeouts = new Map();
    this.ignoredPaths = new Set();

    // Mass-delete detection state
    this._deleteWindow = [];       // timestamps of DELETE events in current window
    this._pendingDeletes = [];     // buffered DELETE eventData waiting for user decision
    this._massDeletePending = false;
    this._massDeleteListener = null; // set by index.js
  }

  // Called by index.js to receive mass-delete warnings
  onMassDeleteWarning(listener) {
    this._massDeleteListener = listener;
  }

  // Called by index.js when user clicks "Continue" in the warning modal
  flushPendingDeletes() {
    const toFlush = this._pendingDeletes.slice();
    this._pendingDeletes = [];
    this._massDeletePending = false;
    this._deleteWindow = [];
    for (const eventData of toFlush) {
      syncQueue.enqueue(this.projectId, eventData);
      if (this.onEventCallback) this.onEventCallback(eventData);
    }
    console.log(`[WATCHER] Flushed ${toFlush.length} buffered deletions into sync queue.`);
  }

  // Called by index.js when user clicks "Pause Sync" (discard deletions)
  discardPendingDeletes() {
    const count = this._pendingDeletes.length;
    this._pendingDeletes = [];
    this._massDeletePending = false;
    this._deleteWindow = [];
    console.log(`[WATCHER] Discarded ${count} buffered deletions — user chose to pause sync.`);
  }

  ignoreNextEvent(filePath) {
    this.ignoredPaths.add(filePath);
    setTimeout(() => {
      this.ignoredPaths.delete(filePath);
    }, 3000);
  }

  async startWatching(projectId, directoryPath, callback) {
    if (this.watcher) {
      this.stopWatching();
    }

    this.watchedPath = directoryPath;
    this.projectId = projectId;
    this.onEventCallback = callback;

    const fs = require('fs/promises');
    let dynamicIgnores = [];

    try {
      const ignorePath = path.join(directoryPath, '.dev-syncignore');
      const ignoreContent = await fs.readFile(ignorePath, 'utf8');
      dynamicIgnores = ignoreContent.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          if (line.endsWith('/')) return `**/${line}**`;
          if (!line.includes('/') && !line.startsWith('*')) return `**/${line}`;
          return line;
        });
      console.log(`[WATCHER] Loaded .dev-syncignore with ${dynamicIgnores.length} rules.`);
    } catch (err) {
      // It's totally fine if .dev-syncignore doesn't exist
    }

    const baseIgnores = [
      /(^|[\/\\])\../,
      '**/.git/**',
      '**/.dev-sync/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/target/**',
      '**/.next/**',
      '**/*.log'
    ];

    this.watcher = chokidar.watch(directoryPath, {
      ignored: [...baseIgnores, ...dynamicIgnores],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 250
      }
    });

    this.watcher
      .on('add',    filePath => this.handleEvent('CREATE', filePath))
      .on('change', filePath => this.handleEvent('MODIFY', filePath))
      .on('unlink', filePath => this.handleEvent('DELETE', filePath))
      .on('error',  error => console.error(`Watcher error: ${error}`));

    console.log(`Started watching: ${directoryPath} for project ${projectId}`);
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.watchedPath = null;
      this.projectId = null;
      console.log('Stopped watching directory');
    }
  }

  _trackDelete() {
    const now = Date.now();
    const windowMs = 3000;
    // Drop events older than the window
    this._deleteWindow = this._deleteWindow.filter(ts => now - ts < windowMs);
    this._deleteWindow.push(now);
    return this._deleteWindow.length;
  }

  async handleEvent(type, filePath) {
    if (this.ignoredPaths.has(filePath)) {
      console.log(`[WATCHER] Ignoring event for ${filePath} (triggered by sync download)`);
      this.ignoredPaths.delete(filePath);
      return;
    }

    // Auto-reload the watcher if .dev-syncignore is modified
    if (filePath.endsWith('.dev-syncignore')) {
      console.log(`[WATCHER] .dev-syncignore changed. Reloading watcher...`);
      this.startWatching(this.projectId, this.watchedPath, this.onEventCallback);
      return;
    }

    if (this.debounceTimeouts.has(filePath)) {
      clearTimeout(this.debounceTimeouts.get(filePath));
    }

    const timeout = setTimeout(async () => {
      this.debounceTimeouts.delete(filePath);

      try {
        const relativePath = path.relative(this.watchedPath, filePath).replace(/\\/g, '/');
        let hash = null;

        if (type === 'CREATE' || type === 'MODIFY') {
          hash = await hashService.hashFile(filePath);
        }

        console.log(`[WATCHER] ${type} - ${relativePath} (Hash: ${hash})`);

        const eventData = {
          type,
          filePath,
          path: relativePath,
          hash,
          timestamp: new Date().toISOString()
        };

        // --- Mass-delete circuit breaker ---
        if (type === 'DELETE') {
          const count = this._trackDelete();

          if (this._massDeletePending) {
            // Already in warning state — buffer this too
            this._pendingDeletes.push(eventData);
            console.log(`[WATCHER] Mass-delete buffering: ${this._pendingDeletes.length} deletions pending.`);
            return;
          }

          if (count >= MASS_DELETE_THRESHOLD) {
            // Trip the circuit breaker — buffer and warn
            this._massDeletePending = true;
            this._pendingDeletes.push(eventData);
            console.log(`[WATCHER] Mass-delete threshold reached (${count} deletes). Pausing sync.`);
            if (this._massDeleteListener) {
              this._massDeleteListener(count);
            }
            return;
          }
        }

        // Normal path
        syncQueue.enqueue(this.projectId, eventData);
        if (this.onEventCallback) {
          this.onEventCallback(eventData);
        }
      } catch (err) {
        console.error(`Error processing file ${filePath}:`, err);
      }
    }, 100);

    this.debounceTimeouts.set(filePath, timeout);
  }
}

module.exports = new WatcherService();
