import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, LogOut, Trash2, ShieldAlert, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/functions';
import { useAuth } from '../contexts/AuthContext';

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
  borderRadius: 10, padding: '10px 14px', color: 'inherit', fontSize: 14, outline: 'none',
};

export default function Settings() {
  const { user, profile, refreshProfile, signOut, isDemo } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [role, setRole] = useState(profile?.role ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (isDemo) { setProfileMsg('Connect Supabase to save profile changes.'); return; }
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, role }).eq('id', user.id);
    setSavingProfile(false);
    setProfileMsg(error ? error.message : 'Saved.');
    if (!error) refreshProfile();
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (isDemo) { setPwMsg('Connect Supabase to change your password.'); return; }
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwBusy(false);
    setPwMsg(error ? error.message : 'Password updated.');
    if (!error) setNewPassword('');
  };

  const handleDelete = async () => {
    if (confirmDelete !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await callFunction('delete-account');
      await signOut();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <header className="page-header">
        <h1 className="page-title">Account Settings</h1>
        <p className="page-subtitle">Manage your profile, security, and account.</p>
      </header>

      <div className="glass-card" style={{ marginBottom: 24 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <User size={18} /> Profile
        </h3>
        <form onSubmit={handleSaveProfile}>
          <Field label="Email"><input style={{ ...inputStyle, opacity: 0.6 }} value={user?.email ?? ''} disabled /></Field>
          <Field label="Full name">
            <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" />
          </Field>
          <Field label="Role / use case">
            <input style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Founder, engineer, writer…" />
          </Field>
          {profileMsg && <p style={{ fontSize: 13, color: 'var(--color-neon-cyan)', marginBottom: 12 }}>{profileMsg}</p>}
          <button type="submit" disabled={savingProfile} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Save size={15} /> {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="glass-card" style={{ marginBottom: 24 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Lock size={18} /> Password
        </h3>
        <form onSubmit={handleChangePassword}>
          <Field label="New password">
            <input type="password" minLength={6} required style={inputStyle} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
          </Field>
          {pwMsg && <p style={{ fontSize: 13, color: 'var(--color-neon-cyan)', marginBottom: 12 }}>{pwMsg}</p>}
          <button type="submit" disabled={pwBusy} className="btn-primary">{pwBusy ? 'Updating…' : 'Update password'}</button>
        </form>
      </div>

      <div className="glass-card" style={{ marginBottom: 24 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <LogOut size={18} /> Session
        </h3>
        <button onClick={() => signOut()} className="btn-secondary">
          Sign out
        </button>
      </div>

      <div className="glass-card" style={{ border: '1px solid rgba(255,90,90,0.35)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#ff6b6b' }}>
          <ShieldAlert size={18} /> Danger zone
        </h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 16 }}>
          Deleting your account permanently erases your profile, connected sources, and every memory
          AXON has stored for you. This cannot be undone.
        </p>
        <p style={{ fontSize: 13, marginBottom: 8 }}>Type <strong>DELETE</strong> to confirm:</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input style={{ ...inputStyle, maxWidth: 160 }} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
          <button
            onClick={handleDelete}
            disabled={confirmDelete !== 'DELETE' || deleting}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: confirmDelete === 'DELETE' ? '#ff4d4d' : 'rgba(255,77,77,0.2)',
              color: '#fff',
              opacity: confirmDelete === 'DELETE' ? 1 : 0.5,
            }}
          >
            <Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
        {deleteError && <p style={{ color: '#ff6b6b', fontSize: 13, marginTop: 10 }}>{deleteError}</p>}
      </div>
    </div>
  );
}
