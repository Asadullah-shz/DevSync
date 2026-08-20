import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';

export const Register: React.FC = () => {
  const [status, setStatus] = useState('Initializing device identity...');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const registerDevice = async () => {
      try {
        setStatus('Generating cryptographic keys...');
        // In our setup, keys are generated on app start, so this is fast
        await new Promise(resolve => setTimeout(resolve, 500));

        setStatus('Registering device with DevSync Cloud...');
        const res = await window.electronAPI.registerDevice();
        
        if (res.success) {
          setStatus('Device registered successfully!');
          setTimeout(() => {
            navigate('/dashboard');
          }, 1000);
        } else {
          setError(res.error || 'Registration failed');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred');
      }
    };

    registerDevice();
  }, [navigate]);

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel animate-fade-in" style={{ padding: '40px', width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: 'var(--shadow-glow)' }}>
          {error ? <ShieldCheck size={32} color="red" /> : <ShieldCheck size={32} color="white" />}
        </div>
        
        <h2 style={{ marginBottom: '16px' }}>Device Registration</h2>
        
        {error ? (
          <div style={{ color: 'red', marginTop: '16px' }}>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/login')} style={{ marginTop: '16px' }}>
              Back to Login
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ marginBottom: '16px', color: 'var(--accent-primary)' }} />
            <p>{status}</p>
            <p style={{ fontSize: '0.8rem', marginTop: '8px', opacity: 0.7 }}>Please do not close the application.</p>
          </div>
        )}
      </div>
    </div>
  );
};
