import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/functions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!isSupabaseConfigured || !supabase || !userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // Demo mode: fake a user so the app is usable without credentials
      setUser({ id: 'demo', email: 'demo@axon.app', user_metadata: { full_name: 'Demo User' } });
      setProfile({ id: 'demo', full_name: 'Demo User', plan_tier: 'pro' });
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = async (email, password, fullName) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  };

  const signIn = async (email, password) => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signInWithGoogle = async () => {
    if (!supabase) return { error: { message: 'Supabase not configured' } };
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const signOut = async () => {
    if (!supabase) {
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
  };

  // Real account deletion — runs server-side (service role) via the
  // delete-account Edge Function, which removes memory_items,
  // source_connections, api_keys, subscriptions and the auth user itself.
  // Never attempt this client-side: RLS blocks deleting the auth user, and
  // deleting rows one table at a time from the browser is unsafe.
  const deleteAccount = async () => {
    if (!supabase || !user) return { error: { message: 'Not authenticated' } };
    try {
      await callFunction('delete-account');
      return { error: null };
    } catch (err) {
      return { error: { message: err.message } };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      deleteAccount,
      refreshProfile,
      isDemo: !isSupabaseConfigured,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
