import type { Mock } from 'vitest';
import { ApiError, apiFetch, errorMessage } from './api';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

const API_URL = 'http://api.test';
const getSession = supabase.auth.getSession as Mock;
const fetchMock = vi.fn();
const assign = vi.fn();

function signedIn(token = 'token-123') {
  getSession.mockResolvedValue({ data: { session: { access_token: token } }, error: null });
}

function signedOut() {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
}

function respond(status: number, body?: unknown) {
  const text = body === undefined ? null : JSON.stringify(body);
  fetchMock.mockResolvedValue(new Response(text, { status }));
}

/** Resolves to "pending" when the promise has not settled after a macrotask. */
function stateOf(promise: Promise<unknown>): Promise<string> {
  const pending = new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 20));
  return Promise.race([promise.then(() => 'settled'), pending]);
}

function sentRequest(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', API_URL);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { assign });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('apiFetch', () => {
  it('attaches the session token as a bearer header', async () => {
    signedIn('token-123');
    respond(200, { trips: [] });

    await expect(apiFetch('/api/v1/trips')).resolves.toEqual({ trips: [] });

    const { url, headers } = sentRequest();
    expect(url).toBe(`${API_URL}/api/v1/trips`);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    // No body, so no content type.
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('sends JSON bodies with a content type and keeps the method', async () => {
    signedIn();
    respond(201, { id: '1' });

    await apiFetch('/api/v1/trips', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    const { init, headers } = sentRequest();
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('does not double the slash when the base URL ends with one', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', `${API_URL}/`);
    signedIn();
    respond(200, {});

    await apiFetch('/api/v1/trips');

    expect(sentRequest().url).toBe(`${API_URL}/api/v1/trips`);
  });

  it('redirects to /login on a 401 and never settles', async () => {
    signedIn();
    respond(401, { detail: 'Invalid or missing access token' });

    const request = apiFetch('/api/v1/trips');

    expect(await stateOf(request)).toBe('pending');
    expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
  });

  it('redirects to /login without calling the API when there is no session', async () => {
    signedOut();

    const request = apiFetch('/api/v1/trips');

    expect(await stateOf(request)).toBe('pending');
    expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats a 422 validation error with the field name', async () => {
    signedIn();
    respond(422, {
      detail: [
        {
          loc: ['body', 'destination'],
          msg: 'String should have at most 100 characters',
          type: 'string_too_long',
        },
      ],
      request_id: 'req-1',
    });

    const error = await apiFetch('/api/v1/trips', { method: 'POST', body: '{}' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'destination: String should have at most 100 characters',
      status: 422,
      requestId: 'req-1',
    });
  });

  it('formats a 422 with several problems, nested fields and model-level errors', async () => {
    signedIn();
    respond(422, {
      detail: [
        { loc: ['body'], msg: 'Value error, end_date must be on or after start_date' },
        { loc: ['body', 'itinerary_data', 0, 'day'], msg: 'Input should be a valid integer' },
        { loc: ['body', 'user_id'], msg: 'Extra inputs are not permitted' },
      ],
    });

    await expect(apiFetch('/api/v1/trips', { method: 'POST', body: '{}' })).rejects.toThrow(
      'end_date must be on or after start_date; ' +
        'itinerary_data.0.day: Input should be a valid integer; ' +
        'user_id: Extra inputs are not permitted',
    );
  });

  it('never shows raw JSON or [object Object] for a 422 it cannot read', async () => {
    signedIn();
    respond(422, { detail: [{ unexpected: true }] });

    await expect(apiFetch('/api/v1/trips')).rejects.toThrow('Request failed (422)');
  });

  it('uses a string detail as the message', async () => {
    signedIn();
    respond(404, { detail: 'Trip not found', request_id: 'req-2' });

    await expect(apiFetch('/api/v1/trips/x')).rejects.toMatchObject({
      message: 'Trip not found',
      status: 404,
      requestId: 'req-2',
    });
  });

  it('falls back to the status when the error body is not JSON', async () => {
    signedIn();
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    await expect(apiFetch('/api/v1/trips')).rejects.toThrow('Request failed (502)');
  });

  it('resolves with null for a 204', async () => {
    signedIn();
    respond(204);

    await expect(apiFetch('/api/v1/trips/1', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('fails clearly when the API URL is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    await expect(apiFetch('/api/v1/trips')).rejects.toThrow('NEXT_PUBLIC_API_URL is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('uses the message of an Error and a generic text otherwise', () => {
    expect(errorMessage(new ApiError('Trip not found', 404))).toBe('Trip not found');
    expect(errorMessage('boom')).toBe('Something went wrong');
  });
});
