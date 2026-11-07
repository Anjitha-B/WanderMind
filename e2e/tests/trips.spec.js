const { test, expect } = require('@playwright/test');

const API = 'http://127.0.0.1:8100';
const SUPABASE = 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const PASSWORD = 'e2e-password-123';

function newEmail(label) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Accepts every alert/confirm and records its text. */
function recordDialogs(page) {
  const messages = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });
  return messages;
}

/** Records every API request so the test can assert what the browser sent. */
function recordApiRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    if (request.url().startsWith(API) && request.method() !== 'OPTIONS') {
      requests.push({
        method: request.method(),
        url: request.url(),
        body: request.postData() || '',
        authorization: request.headers()['authorization'] || '',
      });
    }
  });
  return requests;
}

/** The signed-in user's access token, read from the Supabase session storage. */
async function accessToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    const cookie = document.cookie
      .split('; ')
      .filter((c) => c.includes('-auth-token'))
      .map((c) => c.split('=').slice(1).join('='));
    const raw = key ? localStorage.getItem(key) : decodeURIComponent(cookie.join(''));
    const json = raw.startsWith('base64-') ? atob(raw.slice(7)) : raw;
    return JSON.parse(json).access_token;
  });
}

function subjectOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
}

async function signUp(page, email) {
  await page.goto('/login');
  await page.getByRole('link', { name: /sign up/i }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function logIn(page, email) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function logOut(page) {
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('trip lifecycle, logout, and isolation between two accounts', async ({ browser }) => {
  const emailA = newEmail('a');
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const dialogsA = recordDialogs(pageA);
  const requestsA = recordApiRequests(pageA);

  await test.step('sign up, log out, and log back in', async () => {
    await signUp(pageA, emailA);

    // The signup trigger (handle_new_user, with an empty search_path) made a profile.
    const token = await accessToken(pageA);
    const response = await pageA.request.get(
      `${SUPABASE}/rest/v1/profiles?select=id,firstname,lastname,home_country,preferred_currency`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: subjectOf(token),
        firstname: '',
        lastname: '',
        home_country: '',
        preferred_currency: 'USD',
      },
    ]);

    await logOut(pageA);
    await logIn(pageA, emailA);
  });

  await test.step('generate an itinerary (mocked Gemini)', async () => {
    await pageA.getByPlaceholder('Destination (e.g., Paris)').fill('Lisbon');
    await pageA.getByPlaceholder('Interests (e.g. culture, food, adventure)').fill('food, trams');
    await pageA.getByRole('button', { name: 'Generate Itinerary' }).click();
    await expect(pageA.getByText('Mock activity 1.1')).toBeVisible();
  });

  let tripId;
  await test.step('save it', async () => {
    const saved = pageA.waitForResponse(
      (r) => r.url() === `${API}/api/v1/trips` && r.request().method() === 'POST',
    );
    await pageA.getByRole('button', { name: 'Save to My Trips' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    tripId = (await response.json()).id;
    await expect.poll(() => dialogsA.at(-1)).toContain('saved');
  });

  await test.step('edit it, and the edit survives a reload', async () => {
    await pageA.goto('/trips');
    await pageA.getByText('📍 Lisbon').click();
    await pageA.getByRole('button', { name: /Edit Trip/ }).click();
    await pageA.locator('input[value="Mock activity 1.1"]').fill('Pastéis de Belém');
    await pageA.getByRole('button', { name: /Save Changes/ }).click();
    await expect.poll(() => dialogsA.at(-1)).toContain('updated successfully');

    await pageA.reload();
    await pageA.getByText('📍 Lisbon').click();
    await expect(pageA.getByText('Pastéis de Belém')).toBeVisible();
  });

  await test.step('a second account cannot see or change the first account trips', async () => {
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    recordDialogs(pageB);
    await signUp(pageB, newEmail('b'));

    await pageB.goto('/trips');
    await expect(pageB.getByText("You haven't saved any itineraries yet.")).toBeVisible();
    await expect(pageB.getByText('📍 Lisbon')).toHaveCount(0);

    // Straight to the API with B's own token and A's trip id.
    const tokenB = await accessToken(pageB);
    const statuses = await pageB.evaluate(
      async ({ api, id, token }) => {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const patch = await fetch(`${api}/api/v1/trips/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ itinerary_data: [{ day: 1, activities: ['hijacked'] }] }),
        });
        const del = await fetch(`${api}/api/v1/trips/${id}`, { method: 'DELETE', headers });
        const list = await (await fetch(`${api}/api/v1/trips`, { headers })).json();
        return { patch: patch.status, del: del.status, listed: list.trips.length };
      },
      { api: API, id: tripId, token: tokenB },
    );
    expect(statuses).toEqual({ patch: 404, del: 404, listed: 0 });
    await contextB.close();

    await pageA.reload();
    await pageA.getByText('📍 Lisbon').click();
    await expect(pageA.getByText('Pastéis de Belém')).toBeVisible();
  });

  await test.step('delete it', async () => {
    await pageA.getByRole('button', { name: /Delete/ }).click();
    await expect.poll(() => dialogsA.at(-1)).toContain('removed');
    await expect(pageA.getByText("You haven't saved any itineraries yet.")).toBeVisible();
  });

  await test.step('log out, then Back lands on /login', async () => {
    await pageA.goto('/home');
    await logOut(pageA);
    await pageA.goBack();
    await expect(pageA).toHaveURL(/\/login$/);
    await expect(pageA.getByRole('button', { name: 'Generate Itinerary' })).toHaveCount(0);

    await pageA.goto('/trips');
    await expect(pageA).toHaveURL(/\/login$/);
  });

  await test.step('the browser never sent a user_id, and always sent a token', async () => {
    expect(requestsA.length).toBeGreaterThan(0);
    for (const request of requestsA) {
      expect(request.url + request.body).not.toContain('user_id');
      expect(request.authorization).toMatch(/^Bearer ey/);
    }
  });

  await contextA.close();
});
