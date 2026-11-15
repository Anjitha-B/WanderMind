import { supabase } from './supabase';

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

/** One entry of a FastAPI validation error, as the backend returns it. */
interface ValidationIssue {
  loc?: unknown;
  msg?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function redirectToLogin(): Promise<never> {
  // A full page load on purpose: it drops every piece of in-memory state that
  // belonged to the signed-out user, which a client-side route change keeps.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/login');
  // Never settles: the page is leaving, so callers should not show an error first.
  return new Promise<never>(() => {});
}

/** "start_date: Input should be a valid date", or just the message for a whole-body error. */
function describeIssue(issue: ValidationIssue): string | null {
  if (typeof issue.msg !== 'string') return null;
  const message = issue.msg.replace(/^Value error, /, '');
  const location = Array.isArray(issue.loc) ? issue.loc : [];
  // The first entry says where the value came from ("body", "query"), not which field.
  const field = location
    .slice(1)
    .filter((part) => typeof part === 'string' || typeof part === 'number')
    .join('.');
  return field ? `${field}: ${message}` : message;
}

function messageFrom(body: unknown, status: number): string {
  const detail = isRecord(body) ? body.detail : undefined;
  if (typeof detail === 'string') return detail;
  // FastAPI validation errors (422) arrive as a list of { loc, msg, type }.
  if (Array.isArray(detail)) {
    const issues = detail
      .filter(isRecord)
      .map(describeIssue)
      .filter((text): text is string => text !== null);
    if (issues.length > 0) return issues.join('; ');
  }
  return `Request failed (${status})`;
}

/** The message to show a user for anything a request can throw. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

/**
 * Calls the WanderMind API as the signed-in user.
 * Resolves with the parsed JSON body, or null for an empty response, so `T`
 * should include null for endpoints that return 204. Throws ApiError otherwise.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_API_URL is not set');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return redirectToLogin();

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) return redirectToLogin();
  // Boundary: the caller names the response type, and the generated types in
  // types/api.ts are what keep that in step with the backend.
  if (response.status === 204) return null as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId =
      isRecord(body) && typeof body.request_id === 'string' ? body.request_id : undefined;
    throw new ApiError(messageFrom(body, response.status), response.status, requestId);
  }
  return body as T;
}
