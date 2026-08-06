import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Brain, Mail, Lock, ArrowRight } from 'lucide-react';

const LogoGoogle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.28 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.26a12 12 0 0 0 0 10.8l4.01-3.11z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.6l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate(redirectTo, { replace: true });
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (err) throw err;
        if (data.session) {
          navigate('/onboarding', { replace: true });
        } else {
          setInfo('Check your inbox to confirm your email, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    // If we got here mid-flow (e.g. approving an AI connector while logged
    // out), send Google sign-in back to that exact spot instead of always
    // dropping the user at onboarding.
    const target = location.state?.from && location.state.from !== '/login' ? location.state.from : '/onboarding';
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${target}` },
    });
  };

  return (
    <div className="fullscreen-page">
      <div className="glass-card" style={{ maxWidth: 420, width: '90%', padding: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'radial-gradient(circle, rgba(0,243,255,0.18) 0%, transparent 70%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={32} color="var(--color-neon-cyan)" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: 26, letterSpacing: 1 }}>Axon Memory</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
            {mode === 'signin' ? 'Welcome back.' : 'Create your permanent memory layer.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="glow-btn"
          style={{ width: '100%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}
        >
          <LogoGoogle /> Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 20px', color: 'var(--color-text-secondary)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          OR
          <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
            <Mail size={16} color="var(--color-text-secondary)" />
            <input
              type="email" required placeholder="you@company.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', flex: 1, fontSize: 14 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
            <Lock size={16} color="var(--color-text-secondary)" />
            <input
              type="password" required minLength={6} placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', flex: 1, fontSize: 14 }}
            />
          </label>

          {error && <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>}
          {info && <p style={{ color: '#25c2a0', fontSize: 13 }}>{info}</p>}

          <button type="submit" disabled={busy} className="glow-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={16} />
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--color-neon-cyan)', cursor: 'pointer', fontWeight: 600 }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
        <p style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>&larr; Back to home</Link>
        </p>
      </div>
    </div>
  );
}
