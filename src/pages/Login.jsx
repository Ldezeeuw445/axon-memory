import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

export default function Login() {
  const [tab, setTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (tab === 'signin') {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate('/dashboard');
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setSuccess('Account created! Check your email to confirm, then sign in.');
        setTab('signin');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    const { error } = await signInWithGoogle();
    if (error) setError(error.message);
  };

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: '420px', width: '90%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Brain size={40} color="var(--color-neon-cyan)" style={{ marginBottom: '12px' }} />
          <h1 className="gradient-text" style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '2px' }}>AXON</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '4px', fontSize: '14px' }}>Universal AI Memory Layer</p>
        </div>

        {!isSupabaseConfigured && (
          <div style={{
            background: 'rgba(0,243,255,0.07)', border: '1px solid rgba(0,243,255,0.2)',
            borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px',
            color: 'var(--color-text-secondary)',
          }}>
            🔧 <strong style={{ color: 'var(--color-neon-cyan)' }}>Demo mode</strong> — Supabase not connected yet.{' '}
            <Link to="/dashboard" style={{ color: 'var(--color-neon-cyan)' }}>Continue as demo →</Link>
          </div>
        )}

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
          {['signin', 'signup'].map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccess(''); }}
              style={{
                flex: 1, padding: '8px', border: 'none', cursor: 'pointer', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
                background: tab === t ? 'rgba(0,243,255,0.15)' : 'transparent',
                color: tab === t ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              {t === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '14px', color: '#ff6b6b' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: 'rgba(37,194,160,0.1)', border: '1px solid rgba(37,194,160,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '14px', color: '#25c2a0' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tab === 'signup' && (
            <div className="input-group">
              <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                type="text" placeholder="Full name" value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required className="auth-input"
                style={{ paddingLeft: '40px' }}
              />
            </div>
          )}
          <div className="input-group">
            <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              type="email" placeholder="Email address" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required className="auth-input"
              style={{ paddingLeft: '40px' }}
            />
          </div>
          <div className="input-group">
            <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              type={showPassword ? 'text' : 'password'} placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required minLength={8} className="auth-input"
              style={{ paddingLeft: '40px', paddingRight: '40px' }}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '4px', width: '100%' }}>
            {loading ? 'Loading...' : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        </div>

        <button onClick={handleGoogle} className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          By continuing you agree to our{' '}
          <Link to="/terms" style={{ color: 'var(--color-neon-cyan)' }}>Terms</Link> and{' '}
          <Link to="/privacy" style={{ color: 'var(--color-neon-cyan)' }}>Privacy Policy</Link>
        </p>
      </div>

      <style>{`
        .input-group { position: relative; }
        .auth-input {
          width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.05);
          border: 1px solid var(--color-border); border-radius: 10px;
          color: var(--color-text-primary); font-size: 14px; outline: none;
          transition: border-color 0.2s; box-sizing: border-box;
        }
        .auth-input:focus { border-color: var(--color-neon-cyan); }
        .auth-input::placeholder { color: var(--color-text-secondary); }
      `}</style>
    </div>
  );
}
