import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Lock, Mail, ArrowRight } from 'lucide-react';
import { useStore } from '../store';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const login = useStore((state) => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Fake API delay for UI demonstration
      const res = await window.electronAPI.login(email, password);
      
      if (res.success) {
        login(
          res.user, 
          'mock-access', // Desktop app relies on the sqlite db for session internally
          'mock-refresh'
        );
        // After login, check if device needs registration
        const status = await window.electronAPI.getStatus();
        if (!status.isRegistered) {
          navigate('/register');
        } else {
          navigate('/dashboard');
        }
      } else {
        alert(res.error || 'Login failed');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = async (provider: 'github' | 'google') => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.startSSOLogin(provider);
      if (res.success) {
        login(res.user, res.accessToken || '', res.refreshToken || '');
        const status = await window.electronAPI.getStatus();
        if (!status.isRegistered) {
          navigate('/register');
        } else {
          navigate('/dashboard');
        }
      } else {
        alert(res.error || 'SSO Login failed');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      
      {/* Decorative Background Elements */}
      <div style={{ position: 'absolute', width: 400, height: 400, background: 'var(--accent-primary)', filter: 'blur(100px)', opacity: 0.15, borderRadius: '50%', top: '-10%', left: '-5%' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, background: 'var(--accent-secondary)', filter: 'blur(100px)', opacity: 0.1, borderRadius: '50%', bottom: '-5%', right: '-5%' }} />

      <div className="glass-panel animate-fade-in" style={{ padding: '40px', width: '100%', maxWidth: '420px', position: 'relative', zIndex: 10 }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: 'var(--shadow-glow)' }}>
            <Cloud size={24} color="white" />
          </div>
          <h1 style={{ marginBottom: '8px' }}>Welcome to DevSync</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Synchronize your workspaces securely</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input 
                type="email" 
                className="input-field" 
                placeholder="developer@example.com"
                style={{ paddingLeft: '40px' }}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input 
                type="password" 
                className="input-field" 
                placeholder="••••••••"
                style={{ paddingLeft: '40px' }}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginBottom: '16px' }} disabled={isLoading}>
            {isLoading ? 'Connecting...' : (
              <>
                Sign In to DevSync
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginBottom: '16px', color: 'var(--text-muted)' }}>
          <small>OR</small>
        </div>

        <button 
          onClick={() => handleSSO('github')} 
          className="btn" 
          style={{ width: '100%', padding: '12px', marginBottom: '8px', background: '#24292e', color: 'white' }} 
          disabled={isLoading}
        >
          Sign in with GitHub
        </button>

        <button 
          onClick={() => handleSSO('google')} 
          className="btn" 
          style={{ width: '100%', padding: '12px', background: 'white', color: 'black' }} 
          disabled={isLoading}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
};
