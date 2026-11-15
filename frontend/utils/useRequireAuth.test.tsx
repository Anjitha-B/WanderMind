import { act, renderHook, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { supabase } from './supabase';
import { useRequireAuth } from './useRequireAuth';

const replace = vi.fn();
const unsubscribe = vi.fn();

// One router object for every render, as Next.js provides.
vi.mock('next/router', () => {
  const router = { replace: (...args: unknown[]) => replace(...args) };
  return { useRouter: () => router };
});

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));

type AuthListener = (event: string, session: unknown) => void;

const getSession = supabase.auth.getSession as Mock;
const onAuthStateChange = supabase.auth.onAuthStateChange as Mock;
const SESSION = { access_token: 'token-123', user: { id: 'user-a' } };

let listener: AuthListener;

function storedSession(session: unknown) {
  getSession.mockResolvedValue({ data: { session }, error: null });
}

beforeEach(() => {
  onAuthStateChange.mockImplementation((callback: AuthListener) => {
    listener = callback;
    return { data: { subscription: { unsubscribe } } };
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useRequireAuth', () => {
  it('returns null first, then the session, without redirecting', async () => {
    storedSession(SESSION);

    const { result } = renderHook(() => useRequireAuth());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(SESSION));
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to /login and keeps returning null', async () => {
    storedSession(null);

    const { result } = renderHook(() => useRequireAuth());

    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(result.current).toBeNull();
  });

  it('redirects to /login when the user signs out later', async () => {
    storedSession(SESSION);
    const { result } = renderHook(() => useRequireAuth());
    await waitFor(() => expect(result.current).toBe(SESSION));

    act(() => listener('SIGNED_OUT', null));

    expect(replace).toHaveBeenCalledExactlyOnceWith('/login');
  });

  it('adopts a refreshed session', async () => {
    storedSession(SESSION);
    const { result } = renderHook(() => useRequireAuth());
    await waitFor(() => expect(result.current).toBe(SESSION));
    const refreshed = { ...SESSION, access_token: 'token-456' };

    act(() => listener('TOKEN_REFRESHED', refreshed));

    expect(result.current).toBe(refreshed);
    expect(replace).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount and ignores a session that arrives afterwards', async () => {
    let resolveSession: (value: unknown) => void = () => {};
    getSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
    const { result, unmount } = renderHook(() => useRequireAuth());

    unmount();
    await act(async () => resolveSession({ data: { session: null }, error: null }));

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
