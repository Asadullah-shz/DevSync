import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

export interface SyncEvent {
  id: string;
  type: string;
  path: string;
  timestamp: string;
}

interface Project {
  id: string;
  name: string;
  localPath: string;
  isActive: boolean;
}

interface AppState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  workspaces: Workspace[];
  projects: Project[];
  syncLogs: SyncEvent[];
  
  // Actions
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setDeviceId: (id: string) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  addProject: (project: Project) => void;
  setProjects: (projects: Project[]) => void;
  addSyncLog: (log: SyncEvent) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      deviceId: null,
      workspaces: [],
      projects: [],
      syncLogs: [],
      
      login: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, workspaces: [], projects: [], syncLogs: [] }),
      setDeviceId: (deviceId) => set({ deviceId }),
      setWorkspaces: (workspaces) => set({ workspaces }),
      addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
      setProjects: (projects) => set({ projects }),
      addSyncLog: (log) => set((state) => ({ 
        syncLogs: [log, ...state.syncLogs].slice(0, 50) // Keep last 50 logs
      })),
    }),
    {
      name: 'devsync-storage',
      partialize: (state) => ({ 
        user: state.user, 
        accessToken: state.accessToken, 
        projects: state.projects 
      }),
    }
  )
);
