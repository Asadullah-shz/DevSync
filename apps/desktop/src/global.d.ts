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
      startWatching: (projectId: string, folderPath: string) => void;
      stopWatching: () => void;
      onWatcherEvent: (callback: (event: SyncEvent) => void) => void;
      removeWatcherEvent: () => void;
      getStatus: () => Promise<{ isLoggedIn: boolean, isRegistered: boolean, deviceId: string | null, user: any }>;
      login: (email: string, pass: string) => Promise<{ success: boolean, user?: any, error?: string }>;
      startSSOLogin: (provider: 'github' | 'google') => Promise<{ success: boolean, user?: any, accessToken?: string, refreshToken?: string, error?: string }>;
      registerDevice: () => Promise<{ success: boolean, deviceId?: string, error?: string }>;

      // Tray / sync state
      setTrayStatus: (status: 'SYNCED' | 'SYNCING' | 'CONFLICT' | 'OFFLINE') => Promise<any>;
      getTrayPaused: () => Promise<{ paused: boolean }>;
      onSyncPaused: (callback: (paused: boolean) => void) => void;
      onDevicePendingApproval: (callback: () => void) => void;
      onTrayOpenConflicts: (callback: () => void) => void;
      onTrayOpenHistory:   (callback: () => void) => void;
      onTrayOpenDevices:   (callback: () => void) => void;

      // Mass-delete recovery
      onMassDeleteWarning: (callback: (count: number) => void) => void;
      resumeAfterMassDelete: () => Promise<any>;
      discardMassDelete: () => Promise<any>;

      // Project API
      getWorkspaces: () => Promise<{ success: boolean, workspaces?: any[], error?: string }>;
      createWorkspace: (name: string) => Promise<{ success: boolean, workspace?: any, error?: string }>;
      addWorkspaceMember: (workspaceId: string, email: string, role: string) => Promise<any>;
      updateWorkspaceMemberRole: (workspaceId: string, userId: string, role: string) => Promise<any>;
      removeWorkspaceMember: (workspaceId: string, userId: string) => Promise<any>;
      updateWorkspacePolicies: (workspaceId: string, policies: any) => Promise<{ success: boolean, workspace?: any, error?: string }>;
      getProjects: () => Promise<{ success: boolean, projects?: any[], error?: string }>;
      createProject: (name: string, workspaceId: string, localPath: string) => Promise<{ success: boolean, project?: any, error?: string }>;
      getLocalProjects: () => Promise<{ success: boolean, localProjects?: any[], error?: string }>;
      getProjectHistory: (projectId: string) => Promise<{ success: boolean, history?: any[], error?: string }>;
      restoreFile: (projectId: string, hash: string, relativePath: string) => Promise<{ success: boolean, error?: string }>;
      getDeletedFiles: (projectId: string) => Promise<{ success: boolean, files?: any[], error?: string }>;
      restoreDeletedFile: (projectId: string, fileId: string) => Promise<{ success: boolean, error?: string }>;

      // Audit Logs
      getGlobalAuditLogs: () => Promise<{ success: boolean, logs?: any[], error?: string }>;
      getProjectAuditLogs: (projectId: string) => Promise<{ success: boolean, logs?: any[], error?: string }>;

      getConflicts: (projectId: string) => Promise<any>;
      resolveConflict: (projectId: string, conflictId: string, resolution: 'mine' | 'server') => Promise<any>;

      getDevices: () => Promise<any>;
      revokeDevice: (deviceId: string) => Promise<any>;

      verifyStorage: () => Promise<any>;
      getStorageStats: () => Promise<any>;
    };
  }
}
