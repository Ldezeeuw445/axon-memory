import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
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
    setError(''); setSuccess(''); setLoading(true);
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
      <div className="glass-card" style={{ maxWidth: 400, width: '90%', padding: '36px 32px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/app-icon-1024.png" alt="AXON" style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 12, boxShadow: '0 0 24px rgba(0,243,255,0.2)' }} />
          <h1 className="gradient-text" style={{ fontSize: 24, fontWeight: 900, letterSpacing: '2px' }}>AXON</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 3 }}>Universal AI Memory Layer</p>
        </div>

        {!isSupabaseConfigured && (
          <div style={{ background: 'rgba(0,243,255,0.07)', border: '1px solid rgba(0,243,255,0.18)', borderRadius: 10, padding: '10px 12px', marginBottom: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            🔧 <strong style={{ color: 'var(--color-neon-cyan)' }}>Demo mode</strong> — Supabase not configured.{' '}
            <Link to="/dashboard" style={{ color: 'var(--color-neon-cyan)' }}>Continue as demo →</Link>
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 3, marginBottom: 22 }}>
          {['signin', 'signup'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess(''); }}
              style={{ flex: 1, padding: '7px', border: 'none', cursor: 'pointer', borderRadius: 7, fontWeight: 700, fontSize: 13, background: tab === t ? 'rgba(0,243,255,0.15)' : 'transparent', color: tab === t ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)', transition: 'all 0.2s' }}>
              {t === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {error && <div style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: 8, padding: '9px 12px', marginBottom: 14, fontSize: 13, color: '#ff6b6b' }}>{error}</div>}
        {success && <div style={{ background: 'rgba(37,194,160,0.08)', border: '1px solid rgba(37,194,160,0.25)', borderRadius: 8, padding: '9px 12px', marginBottom: 14, fontSize: 13, color: '#25c2a0' }}>{success}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'signup' && (
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input type="text" placeholder="Full name" value={fullName} onChange={e => setFullName(e.target.value)} required
                style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 9, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 9, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              style={{ width: '100%', padding: '11px 40px 11px 36px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 9, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              {showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 2 }}>
            {loading ? 'Loading…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        <button onClick={handleGoogle} className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          By continuing you agree to our{' '}
          <Link to="/terms" style={{ color: 'var(--color-neon-cyan)' }}>Terms</Link> and{' '}
          <Link to="/privacy" style={{ color: 'var(--color-neon-cyan)' }}>Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
