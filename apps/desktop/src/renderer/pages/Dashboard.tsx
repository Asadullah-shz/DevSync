import React, { useEffect, useState } from 'react';
import { useStore, SyncEvent } from '../store';
import { LogOut, FolderSync, Plus, HardDrive, Settings, FileCode, CheckCircle2, AlertCircle, Trash2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user, logout, projects, setProjects, addProject, syncLogs, addSyncLog } = useStore();
  const navigate = useNavigate();
  const [isWatching, setIsWatching] = useState<{ [key: string]: boolean }>({});
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  const [showConflictsFor, setShowConflictsFor] = useState<string | null>(null);
  const [projectConflicts, setProjectConflicts] = useState<any[]>([]);
  const [isResolving, setIsResolving] = useState(false);

  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [isRevoking, setIsRevoking] = useState(false);

  const [showStorageHealth, setShowStorageHealth] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  const [showActivity, setShowActivity] = useState(false);
  const [projectHistory, setProjectHistory] = useState<any[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const [showTrash, setShowTrash] = useState<string | null>(null);
  const [deletedFiles, setDeletedFiles] = useState<any[]>([]);
  const [isRestoringDeleted, setIsRestoringDeleted] = useState(false);

  const [storageStats, setStorageStats] = useState<{ usedBytes: number; totalFiles: number } | null>(null);

  // Mass-delete warning state
  const [massDeleteCount, setMassDeleteCount] = useState<number | null>(null);
  const [isMassDeleteResolving, setIsMassDeleteResolving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!window.electronAPI) return;
      
      try {
        const wsData = await window.electronAPI.getWorkspaces();
        if (wsData.success && wsData.workspaces && wsData.workspaces.length === 0) {
          const newWs = await window.electronAPI.createWorkspace('Personal Space');
          if (newWs.success && newWs.workspace) setWorkspaces([newWs.workspace]);
        } else if (wsData.success && wsData.workspaces) {
          setWorkspaces(wsData.workspaces);
        }

        const projData = await window.electronAPI.getProjects();
        const localData = await window.electronAPI.getLocalProjects();
        
        if (projData.success && projData.projects && localData.success && localData.localProjects) {
          const merged = projData.projects.map((p: any) => {
            const local = localData.localProjects!.find((lp: any) => lp.project_id === p.id);
            return {
              ...p,
              localPath: local ? local.local_path : null,
              isActive: !!local
            };
          });
          setProjects(merged);
        }
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    loadData();

    // Load storage stats separately (non-blocking)
    if (window.electronAPI) {
      window.electronAPI.getStorageStats().then((res: any) => {
        if (res.success && res.stats) setStorageStats(res.stats);
      }).catch(() => {});
    }

    // Listen for file watcher events from Electron
    if (window.electronAPI) {
      window.electronAPI.onWatcherEvent((event: any) => {
        const newEvent: SyncEvent = {
          id: Math.random().toString(36).substring(7),
          type: event.type,
          path: event.path,
          timestamp: event.timestamp,
        };
        addSyncLog(newEvent);
        // Tell tray we are syncing
        window.electronAPI.setTrayStatus('SYNCING').catch(() => {});
        // After a short delay, mark as synced (the queue will eventually drain)
        setTimeout(() => {
          window.electronAPI.setTrayStatus('SYNCED').catch(() => {});
        }, 8000);
      });

      // Tray deep-link listeners
      window.electronAPI.onTrayOpenConflicts(() => {
        // Scroll to / open conflicts panel — for now just show the window
      });
      window.electronAPI.onTrayOpenDevices(() => {
        setShowDevices(true);
        loadDevices();
      });

      // Mass-delete circuit-breaker listener
      window.electronAPI.onMassDeleteWarning((count: number) => {
        setMassDeleteCount(count);
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeWatcherEvent();
      }
    };
  }, [addSyncLog, setProjects]);


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNewProject = async () => {
    if (!window.electronAPI) return;
    
    if (workspaces.length === 0) {
      alert("No workspace found to create a project.");
      return;
    }

    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      const folderName = folderPath.split('\\').pop() || folderPath.split('/').pop() || 'New Project';
      const defaultWorkspaceId = workspaces[0].id;
      
      try {
        const res = await window.electronAPI.createProject(folderName, defaultWorkspaceId, folderPath);
        if (res.success) {
          const newProject = {
            ...res.project,
            localPath: folderPath,
            isActive: true
          };
          addProject(newProject);
          
          // Auto-start watching
          window.electronAPI.startWatching(newProject.id, folderPath);
          setIsWatching(prev => ({ ...prev, [newProject.id]: true }));
        } else {
          alert("Failed to create project: " + res.error);
        }
      } catch (e: any) {
        alert("Error: " + e.message);
      }
    }
  };

  const toggleWatch = (project: any) => {
    if (!project.localPath) {
      alert('This project is not linked to a local folder yet.');
      return;
    }

    if (isWatching[project.id]) {
      // In a real app we'd need a specific stop/unwatch for a project, 
      // but the watcher service only handles one for now.
      window.electronAPI?.stopWatching();
      setIsWatching(prev => ({ ...prev, [project.id]: false }));
    } else {
      window.electronAPI?.startWatching(project.id, project.localPath);
      setIsWatching(prev => ({ ...prev, [project.id]: true }));
    }
  };

  const loadHistory = async (projectId: string) => {
    if (!window.electronAPI) return;
    try {
      setHistoryVersions([]);
      const res = await window.electronAPI.getProjectHistory(projectId);
      if (res.success && res.versions) {
        setHistoryVersions(res.versions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async (version: any) => {
    if (!window.electronAPI || !showHistoryFor) return;
    
    if (confirm(`Are you sure you want to restore ${version.file.path} to version ${version.version}? This will overwrite the local file.`)) {
      setIsRestoring(true);
      try {
        const res = await window.electronAPI.restoreFile(showHistoryFor, version.hash, version.file.path);
        if (res.success) {
          alert('File restored successfully! The watcher will sync this as a new version.');
          setShowHistoryFor(null);
        } else {
          alert('Failed to restore: ' + res.error);
        }
      } catch (e: any) {
        alert('Error: ' + e.message);
      } finally {
        setIsRestoring(false);
      }
    }
  };

  const loadConflicts = async (projectId: string) => {
    if (!window.electronAPI) return;
    try {
      setProjectConflicts([]);
      const res = await window.electronAPI.getConflicts(projectId);
      if (res.success && res.conflicts) {
        setProjectConflicts(res.conflicts);
        // Update tray to reflect conflict state
        if (res.conflicts.length > 0) {
          window.electronAPI.setTrayStatus('CONFLICT').catch(() => {});
        } else {
          window.electronAPI.setTrayStatus('SYNCED').catch(() => {});
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolve = async (conflictId: string, resolution: 'mine' | 'server') => {
    if (!window.electronAPI || !showConflictsFor) return;
    
    setIsResolving(true);
    try {
      const res = await window.electronAPI.resolveConflict(showConflictsFor, conflictId, resolution);
      if (res.success) {
        alert('Conflict resolved!');
        await loadConflicts(showConflictsFor);
      } else {
        alert('Failed to resolve: ' + res.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsResolving(false);
    }
  };

  const loadDevices = async () => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.getDevices();
      if (res.success && res.devices) {
        setDevices(res.devices);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!window.electronAPI) return;
    if (confirm('Are you sure you want to revoke this device? It will immediately log out and stop syncing.')) {
      setIsRevoking(true);
      try {
        const res = await window.electronAPI.revokeDevice(deviceId);
        if (res.success) {
          alert('Device revoked successfully.');
          await loadDevices();
        } else {
          alert('Failed to revoke device: ' + res.error);
        }
      } catch (e: any) {
        alert('Error: ' + e.message);
      } finally {
        setIsRevoking(false);
      }
    }
  };

  const handleScanStorage = async () => {
    if (!window.electronAPI) return;
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await window.electronAPI.verifyStorage();
      if (res.success) {
        setScanResult(res.result);
      } else {
        alert('Failed to scan storage: ' + res.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsScanning(false);
    }
  };

  const loadProjectActivity = async (projectId: string) => {
    if (!window.electronAPI) return;
    setIsLoadingActivity(true);
    try {
      const res = await window.electronAPI.getProjectHistory(projectId);
      if (res.success && res.history) {
        setProjectHistory(res.history);
      } else {
        alert('Failed to load activity: ' + res.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const loadDeletedFiles = async (projectId: string) => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.getDeletedFiles(projectId);
      if (res.success && res.files) {
        setDeletedFiles(res.files);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestoreDeleted = async (fileId: string) => {
    if (!showTrash || !window.electronAPI) return;
    setIsRestoringDeleted(true);
    try {
      const res = await window.electronAPI.restoreDeletedFile(showTrash, fileId);
      if (res.success) {
        alert('File restored successfully!');
        await loadDeletedFiles(showTrash);
      } else {
        alert('Failed to restore file: ' + res.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsRestoringDeleted(false);
    }
  };

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      
      {/* Top Navigation */}
      <header className="glass-panel" style={{ 
        margin: '16px', 
        padding: '16px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderTopLeftRadius: 'var(--border-radius-lg)',
        borderTopRightRadius: 'var(--border-radius-lg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderSync size={16} color="white" />
          </div>
          <h3 style={{ margin: 0 }}>DevSync</h3>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
              {user?.name?.charAt(0) || 'D'}
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{user?.name}</span>
          </div>
          
          <button className="btn btn-secondary" style={{ padding: '8px' }} onClick={handleLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '0 16px', display: 'flex', gap: '16px', flex: 1, overflow: 'hidden', marginBottom: '16px' }}>
        
        {/* Sidebar */}
        <aside className="glass-panel" style={{ width: '250px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ padding: '8px 12px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginTop: '8px' }}>
            Workspaces
          </div>
          
          <div className="glass-panel" style={{ padding: '12px', cursor: 'pointer', background: 'var(--glass-highlight)', borderColor: 'var(--accent-glow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Personal Space</span>
            </div>
          </div>

          <div 
            style={{ padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}
            onClick={() => { setShowDevices(true); loadDevices(); }}
          >
            <Settings size={16} />
            <span style={{ fontSize: '0.875rem' }}>Devices</span>
          </div>

          <div 
            style={{ padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}
            onClick={() => { setShowStorageHealth(true); }}
          >
            <HardDrive size={16} />
            <span style={{ fontSize: '0.875rem' }}>Storage Health</span>
          </div>

          {/* Storage Usage Bar */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
            {storageStats && (
              <div style={{ padding: '0 12px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><HardDrive size={12} /> Storage</span>
                  <span>{(storageStats.usedBytes / (1024 * 1024)).toFixed(1)} MB · {storageStats.totalFiles} files</span>
                </div>
                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (storageStats.usedBytes / (1024 * 1024 * 1024)) * 10)}%`, background: 'var(--accent-gradient)', borderRadius: '2px', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}

            {/* Mini Live Log */}
            <div style={{ padding: '0 12px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '12px' }}>
              Recent Activity
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '200px' }}>
              {syncLogs.slice(0, 5).map(log => (
                <div key={log.id} style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', padding: '8px', borderRadius: '6px' }}>
                  <FileCode size={12} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 500, color: log.type === 'DELETE' ? 'var(--error)' : 'var(--success)' }}>{log.type}</div>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>{log.path}</div>
                  </div>
                </div>
              ))}
              {syncLogs.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No recent activity
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Content */}
        <section className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2>Sync Projects</h2>
            <button className="btn btn-primary" onClick={handleNewProject}>
              <Plus size={16} />
              New Project
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            
            {projects.map(project => (
              <div key={project.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'transform 0.2s ease', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FolderSync size={20} color="var(--accent-primary)" />
                  </div>
                  <button 
                    className={`btn ${isWatching ? 'btn-primary' : 'btn-secondary'}`} 
                    style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                    onClick={(e) => { e.stopPropagation(); toggleWatch(project.localPath); }}
                  >
                    {isWatching ? (
                      <><CheckCircle2 size={12} /> Syncing</>
                    ) : (
                      <><AlertCircle size={12} /> Paused</>
                    )}
                  </button>
                </div>
                
                <div>
                  <h3 style={{ marginBottom: '4px' }}>{project.name}</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{project.localPath}</p>
                </div>
                
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {project.id}</span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 12px', fontSize: '0.75rem', borderColor: 'var(--error)', color: 'var(--error)' }}
                      onClick={(e) => { e.stopPropagation(); setShowConflictsFor(project.id); loadConflicts(project.id); }}
                    >
                      Conflicts
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                      onClick={(e) => { e.stopPropagation(); setShowHistoryFor(project.id); loadHistory(project.id); }}
                    >
                      History
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                      onClick={(e) => { e.stopPropagation(); setShowActivity(true); loadProjectActivity(project.id); }}
                    >
                      <Activity size={12} />
                      Activity
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                      onClick={(e) => { e.stopPropagation(); setShowTrash(project.id); loadDeletedFiles(project.id); }}
                    >
                      <Trash2 size={12} />
                      Trash
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {projects.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--glass-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <FolderSync size={32} color="var(--text-muted)" />
                </div>
                <h3>No projects yet</h3>
                <p style={{ maxWidth: '300px', margin: '8px auto 24px', fontSize: '0.875rem' }}>Click "New Project" to register a local folder and start syncing to DevSync.</p>
                <button className="btn btn-primary" onClick={handleNewProject}>
                  Select Folder
                </button>
              </div>
            )}

          </div>
        </section>

      </main>

      {/* History Modal */}
      {showHistoryFor && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Project History</h2>
              <button className="btn btn-secondary" onClick={() => setShowHistoryFor(null)}>Close</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ padding: '8px' }}>File</th>
                    <th style={{ padding: '8px' }}>Version</th>
                    <th style={{ padding: '8px' }}>User</th>
                    <th style={{ padding: '8px' }}>Date</th>
                    <th style={{ padding: '8px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historyVersions.map(v => (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '8px' }}>{v.file.path}</td>
                      <td style={{ padding: '8px' }}>v{v.version}</td>
                      <td style={{ padding: '8px' }}>{v.user ? v.user.name : 'Unknown'}</td>
                      <td style={{ padding: '8px' }}>{new Date(v.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '8px' }}>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => handleRestore(v)}
                          disabled={isRestoring}
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                  {historyVersions.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No history available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Conflicts Modal */}
      {showConflictsFor && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertCircle color="var(--error)" />
                <h2 style={{ margin: 0 }}>Resolve Conflicts</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowConflictsFor(null)}>Close</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ padding: '8px' }}>File</th>
                    <th style={{ padding: '8px' }}>Detected At</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectConflicts.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '8px' }}>{c.path}</td>
                      <td style={{ padding: '8px' }}>{new Date(c.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => handleResolve(c.id, 'server')}
                          disabled={isResolving}
                        >
                          Keep Server
                        </button>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => handleResolve(c.id, 'mine')}
                          disabled={isResolving}
                        >
                          Keep Mine
                        </button>
                      </td>
                    </tr>
                  ))}
                  {projectConflicts.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--success)' }}>
                        <CheckCircle2 size={32} style={{ margin: '0 auto 12px', display: 'block' }} />
                        No conflicts! You are fully synced.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Devices Modal */}
      {showDevices && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>My Devices</h2>
              <button className="btn btn-secondary" onClick={() => setShowDevices(false)}>Close</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ padding: '8px' }}>Device</th>
                    <th style={{ padding: '8px' }}>Status</th>
                    <th style={{ padding: '8px' }}>Last Seen</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--glass-border)', opacity: d.status === 'REVOKED' ? 0.5 : 1 }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 600 }}>{d.deviceName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.id}</div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: '12px', 
                          fontSize: '0.7rem',
                          background: d.status === 'REVOKED' ? 'var(--error)' : 'var(--success)',
                          color: '#fff'
                        }}>
                          {d.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>{new Date(d.lastSeenAt).toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {d.status !== 'REVOKED' && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 12px', fontSize: '0.75rem', borderColor: 'var(--error)', color: 'var(--error)' }}
                            onClick={() => handleRevokeDevice(d.id)}
                            disabled={isRevoking}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {devices.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No devices found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Storage Health Modal */}
      {showStorageHealth && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '600px', display: 'flex', flexDirection: 'column', padding: '24px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <HardDrive color="var(--accent-primary)" />
                <h2 style={{ margin: 0 }}>Storage Health</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowStorageHealth(false)}>Close</button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              DevSync uses Content-Addressable Storage. We can cryptographically verify that your files on the server have not been corrupted or tampered with.
            </p>

            <button 
              className="btn btn-primary" 
              style={{ padding: '12px', fontSize: '1rem', width: '100%', justifyContent: 'center', marginBottom: '24px' }}
              onClick={handleScanStorage}
              disabled={isScanning}
            >
              {isScanning ? 'Scanning Server Storage...' : 'Run Integrity Scan'}
            </button>

            {scanResult && (
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <h3 style={{ marginBottom: '16px' }}>Scan Results</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Files Scanned:</span>
                  <span style={{ fontWeight: 600 }}>{scanResult.scanned}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Scan Duration:</span>
                  <span style={{ fontWeight: 600 }}>{scanResult.durationMs} ms</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Corrupted Files:</span>
                  <span style={{ fontWeight: 600, color: scanResult.corrupted.length > 0 ? 'var(--error)' : 'var(--success)' }}>
                    {scanResult.corrupted.length}
                  </span>
                </div>
                
                {scanResult.corrupted.length > 0 && (
                  <div>
                    <h4 style={{ color: 'var(--error)', marginBottom: '8px' }}>Corrupted Hashes:</h4>
                    <ul style={{ color: 'var(--error)', fontSize: '0.875rem', paddingLeft: '20px', margin: 0 }}>
                      {scanResult.corrupted.map((c: string) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {scanResult.corrupted.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', marginTop: '16px' }}>
                    <CheckCircle2 size={16} />
                    <span>All files cryptographically verified!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Activity color="var(--accent-primary)" />
                <h2 style={{ margin: 0 }}>Project Activity</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowActivity(false)}>Close</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {isLoadingActivity ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading activity...</div>
              ) : projectHistory.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No activity found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {projectHistory.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', gap: '16px', paddingBottom: '16px', borderBottom: i < projectHistory.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                      <div style={{ width: '60px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600 }}>{item.user ? item.user.name : item.createdBy}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>on</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.device ? item.device.deviceName : item.deviceId}</span>
                        </div>
                        <div style={{ fontSize: '0.875rem' }}>
                          <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>Modified: </span>
                          <span>{item.file.path}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Version: {item.version}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {showTrash && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Trash2 color="var(--accent-primary)" />
                <h2 style={{ margin: 0 }}>Deleted Files</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowTrash(null)}>Close</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ padding: '8px' }}>File Path</th>
                    <th style={{ padding: '8px' }}>Deleted At</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedFiles.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '8px' }}>{f.path}</td>
                      <td style={{ padding: '8px' }}>{new Date(f.updatedAt).toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => handleRestoreDeleted(f.id)}
                          disabled={isRestoringDeleted}
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                  {deletedFiles.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No deleted files found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* ── Mass-Delete Warning Modal ── */}
      {massDeleteCount !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(8px)'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '480px', width: '90%', padding: '32px',
            border: '1px solid var(--error)', textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ color: 'var(--error)', marginBottom: '12px' }}>
              Mass Deletion Detected
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.95rem' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{massDeleteCount} files</strong> appear to have been deleted from the local folder.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '28px' }}>
              This may be accidental. Do you want to sync these deletions to the server and all other devices?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', minWidth: '140px' }}
                disabled={isMassDeleteResolving}
                onClick={async () => {
                  setIsMassDeleteResolving(true);
                  await window.electronAPI.discardMassDelete();
                  setMassDeleteCount(null);
                  setIsMassDeleteResolving(false);
                }}
              >
                ⏸ Pause Sync
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--error)', borderColor: 'var(--error)', minWidth: '140px' }}
                disabled={isMassDeleteResolving}
                onClick={async () => {
                  setIsMassDeleteResolving(true);
                  await window.electronAPI.resumeAfterMassDelete();
                  setMassDeleteCount(null);
                  setIsMassDeleteResolving(false);
                }}
              >
                Continue Sync
              </button>
            </div>
            <p style={{ marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Pause Sync keeps files safe on the server. Continue will propagate all deletions.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
