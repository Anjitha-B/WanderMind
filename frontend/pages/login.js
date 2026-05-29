import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../utils/supabase';

export default function Login() {
  const router = useRouter();
  const isInitialSession = useRef(true);
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/home` : undefined;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isInitialSession.current) {
        isInitialSession.current = false;
        return;
      }

      if (session && _event === 'SIGNED_IN') {
        router.replace('/home');
      }
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img
              src="/Wander Mind-icon.png"
              width={28}
              height={28}
              alt="WanderMind logo"
            />
            <h1 className="text-3xl font-bold text-[#652C15] font-['Forge_BC']">
              WanderMind
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            Sign in or create an account to start saving your personalized itineraries.
          </p>
        </div>

        {/* Beautiful Pre-built Supabase Drop-In Authentication Card UI */}
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#652C15',
                  brandAccent: '#4a1f0e',
                },
              },
            },
          }}
          providers={['google']} // Adds a free social OAuth button instantly!
          redirectTo={redirectTo}
        />
      </div>
    </div>
  );
}