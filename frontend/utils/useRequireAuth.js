import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from './supabase';

/**
 * Sends signed-out visitors to /login. Returns the session, or null until one is
 * confirmed, so pages should render nothing protected while it is null.
 */
export function useRequireAuth() {
  const router = useRouter();
  const [session, setSession] = useState(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setSession(data.session);
      else router.replace('/login');
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
      else if (nextSession) setSession(nextSession);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  return session;
}
