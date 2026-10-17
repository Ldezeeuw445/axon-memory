import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { humanAuthError } from '../lib/authErrors';

export default function Login() {
  // signin | signup | forgot (send a reset mail) | reset (arrived from that mail: choose a new password)
  const [tab, setTab] = useState(() => { const m = new URLSearchParams(window.location.search).get('mode'); return ['signup', 'forgot', 'reset'].includes(m) ? m : 'signin'; });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { signIn, signUp, signInWithGoogle, sendPasswordReset, setNewPassword, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/recall';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      if (tab === 'signin') {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate(from, { replace: true });
      } else if (tab === 'signup') {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setSuccess(`Almost there. We sent a link to ${email}: open it to confirm, then sign in here.`);
        setTab('signin');
      } else if (tab === 'forgot') {
        const { error } = await sendPasswordReset(email);
        if (error) throw error;
        setSuccess(`If ${email} has an account, a reset link is on its way. It works once, for an hour.`);
      } else if (tab === 'reset') {
        if (!user) throw new Error('This reset link has expired or was already used. Ask for a new one.');
        const { error } = await setNewPassword(password);
        if (error) throw error;
        navigate('/recall', { replace: true });
      }
    } catch (err) {
      setError(humanAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    const { error } = await signInWithGoogle();
    if (error) setError(humanAuthError(error));
  };

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: 400, width: '90%', padding: '36px 32px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/brand/axon-mark-256.webp" alt="AXON" width="64" height="64" fetchPriority="high" style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 12, boxShadow: '0 0 24px rgba(255,183,51,0.18)' }} />
          <h1 className="gradient-text" style={{ fontSize: 24, fontWeight: 900, letterSpacing: '2px' }}>AXON</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 3 }}>One memory. Every AI.</p>
        </div>

        {!isSupabaseConfigured && (
          <div style={{ background: 'rgba(255,183,51,0.07)', border: '1px solid rgba(255,183,51,0.18)', borderRadius: 10, padding: '10px 12px', marginBottom: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            🔧 <strong style={{ color: 'var(--color-neon-cyan)' }}>Demo mode</strong> — Supabase not configured.{' '}
            <Link to="/" style={{ color: 'var(--color-neon-cyan)' }}>Continue as demo →</Link>
          </div>
        )}

        {(tab === 'forgot' || tab === 'reset') && (
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{tab === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{tab === 'forgot' ? "Enter your email and we'll send a link to choose a new one." : 'At least 8 characters. You stay signed in on this device.'}</p>
          </div>
        )}

        {/* Tab switcher */}
        {(tab === 'signin' || tab === 'signup') && <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 3, marginBottom: 22 }}>
          {['signin', 'signup'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess(''); }}
              style={{ flex: 1, padding: '7px', border: 'none', cursor: 'pointer', borderRadius: 7, fontWeight: 700, fontSize: 13, background: tab === t ? 'rgba(255,183,51,0.12)' : 'transparent', color: tab === t ? '#FFD98A' : 'var(--color-text-secondary)', transition: 'all 0.2s' }}>
              {t === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>}

        {error && <div role="alert" style={{ background: 'rgba(255,183,51,0.06)', border: '1px solid rgba(255,183,51,0.2)', borderRadius: 8, padding: '9px 12px', marginBottom: 14, fontSize: 13, color: '#E8D3A8' }}>{error}</div>}
        {success && <div role="status" style={{ background: 'rgba(37,194,160,0.08)', border: '1px solid rgba(37,194,160,0.25)', borderRadius: 8, padding: '9px 12px', marginBottom: 14, fontSize: 13, color: '#25c2a0' }}>{success}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'signup' && (
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input type="text" placeholder="Full name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required
                style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 9, color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          {tab !== 'reset' && <div style={{ position: 'relative' }}>
            <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input type="email" placeholder="Email address" autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 9, color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' }} />
          </div>}
          {tab !== 'forgot' && <div style={{ position: 'relative' }}>
            <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input type={showPassword ? 'text' : 'password'} placeholder={tab === 'reset' ? 'New password' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              style={{ width: '100%', padding: '11px 40px 11px 36px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 9, color: '#fff', fontSize: 16, outline: 'none', boxSizing: 'border-box' }} />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} style={{ padding: 6, position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              {showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          </div>}
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 2 }}>
            {loading
              ? ({ signin: 'Signing in…', signup: 'Creating your account…', forgot: 'Sending…', reset: 'Saving…' })[tab]
              : ({ signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save and continue' })[tab]}
          </button>
          {tab === 'signin' && <button type="button" className="ax-link-btn" onClick={() => { setTab('forgot'); setError(''); setSuccess(''); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: 13, padding: '8px 0 0', cursor: 'pointer', alignSelf: 'center' }}>Forgot your password?</button>}
          {tab === 'forgot' && <button type="button" onClick={() => { setTab('signin'); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: 13, padding: '8px 0 0', cursor: 'pointer', alignSelf: 'center' }}>Back to sign in</button>}
        </form>

        {(tab === 'signin' || tab === 'signup') && <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        <button onClick={handleGoogle} className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        </>}

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          By continuing you agree to our{' '}
          <Link to="/terms" style={{ color: '#FFD98A' }}>Terms</Link> and{' '}
          <Link to="/privacy" style={{ color: '#FFD98A' }}>Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
