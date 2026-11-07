import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(message, status, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

function redirectToLogin() {
  window.location.assign('/login');
  // Never settles: the page is leaving, so callers should not show an error first.
  return new Promise(() => {});
}

function messageFrom(body, status) {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  // FastAPI validation errors arrive as a list of { loc, msg, type }.
  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg.replace(/^Value error, /, '');
  }
  return `Request failed (${status})`;
}

/**
 * Calls the WanderMind API as the signed-in user.
 * Returns parsed JSON, or null for an empty response. Throws ApiError otherwise.
 */
export async function apiFetch(path, options = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_API_URL is not set');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return redirectToLogin();

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) return redirectToLogin();
  if (response.status === 204) return null;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      messageFrom(body, response.status),
      response.status,
      body?.request_id,
    );
  }
  return body;
}
