import React, { useEffect, useState } from 'react';
import { useStore, SyncEvent } from '../store';
import { LogOut, FolderSync, Plus, HardDrive, Settings, FileCode, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user, logout, projects, addProject, syncLogs, addSyncLog } = useStore();
  const navigate = useNavigate();
  const [isWatching, setIsWatching] = useState(false);

  useEffect(() => {
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
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeWatcherEvent();
      }
    };
  }, [addSyncLog]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNewProject = async () => {
    if (!window.electronAPI) return;
    
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      const folderName = folderPath.split('\\').pop() || folderPath.split('/').pop() || 'New Project';
      
      const newProject = {
        id: `PRJ-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        name: folderName,
        localPath: folderPath,
        isActive: true
      };
      
      addProject(newProject);
      
      // Auto-start watching the newly added project
      window.electronAPI.startWatching(folderPath);
      setIsWatching(true);
    }
  };

  const toggleWatch = (path: string) => {
    if (isWatching) {
      window.electronAPI?.stopWatching();
      setIsWatching(false);
    } else {
      window.electronAPI?.startWatching(path);
      setIsWatching(true);
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

          <div style={{ padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
            <Settings size={16} />
            <span style={{ fontSize: '0.875rem' }}>Preferences</span>
          </div>

          {/* Mini Live Log */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
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
    </div>
  );
};
