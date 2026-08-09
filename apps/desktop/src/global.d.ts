export interface SyncEvent {
  type: 'CREATE' | 'MODIFY' | 'DELETE' | 'RENAME';
  path: string;
  hash: string | null;
  timestamp: string;
}

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      startWatching: (folderPath: string) => void;
      stopWatching: () => void;
      onWatcherEvent: (callback: (event: SyncEvent) => void) => void;
      removeWatcherEvent: () => void;
    };
  }
}
