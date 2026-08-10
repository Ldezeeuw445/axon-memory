// Single source of truth on the frontend for "what can this user do right
// now" — reads the server-computed `user_plan_status` view (which itself
// reflects `plan_features`, so upgrading a feature matrix in the DB doesn't
// require a frontend redeploy) and exposes both raw status and a
// `useFeatureFlag('has_axon_ai')`-style helper for gating UI.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_STATUS = {
  plan_tier: 'starter',
  plan_started_at: null,
  plan_expires_at: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  stripe_price_id: null,
  has_connections: false,
  has_axon_ai: false,
  has_advanced_search: false,
  has_semantic_search: false,
  has_api_access: false,
};

export function usePlan() {
  const { session } = useAuth();
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setStatus(EMPTY_STATUS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_plan_status')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (!error && data) setStatus(data);
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const has = useCallback((flag) => Boolean(status[`has_${flag}`]), [status]);

  return { ...status, loading, has, refresh };
}

/**
 * Lightweight gate for a single feature flag. Usage:
 *   const { allowed, loading } = useFeatureFlag('axon_ai');
 */
export function useFeatureFlag(featureKey) {
  const plan = usePlan();
  return { allowed: plan.has(featureKey), loading: plan.loading, plan };
}
