const { test, expect } = require('@playwright/test');

const API = 'http://127.0.0.1:8100';
const SUPABASE = 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const PASSWORD = 'e2e-password-123';

function newEmail(label) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Records any alert/confirm. The app reports inline, so none should open. */
function recordDialogs(page) {
  const messages = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.dismiss();
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

/**
 * Runs a sign-up or sign-in and returns the access token from the Supabase Auth
 * response the browser received. That is the browser's own session, read without
 * depending on how @supabase/ssr stores it (cookie names and encoding change
 * between releases).
 */
async function sessionFrom(page, authPath, submit) {
  const authResponse = page.waitForResponse(
    (r) => r.url().startsWith(`${SUPABASE}${authPath}`) && r.request().method() === 'POST',
  );
  await submit();
  const response = await authResponse;
  expect(response.status()).toBe(200);
  const { access_token: token } = await response.json();
  expect(token).toMatch(/^ey/);
  return token;
}

/** A Date as the YYYY-MM-DD calendar day in the local timezone, as the app sends it. */
function localDay(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function subjectOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
}

/** Signs up through the UI and returns the new session's access token. */
async function signUp(page, email) {
  await page.goto('/login');
  await page.getByRole('link', { name: /sign up/i }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const token = await sessionFrom(page, '/auth/v1/signup', () =>
    page.getByRole('button', { name: 'Sign up', exact: true }).click(),
  );
  await expect(page).toHaveURL(/\/home$/);
  return token;
}

/** Signs in through the UI and returns the new session's access token. */
async function logIn(page, email) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const token = await sessionFrom(page, '/auth/v1/token', () =>
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  );
  await expect(page).toHaveURL(/\/home$/);
  return token;
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
  let tokenA;

  await test.step('sign up, log out, and log back in', async () => {
    const token = await signUp(pageA, emailA);

    // The signup trigger (handle_new_user, with an empty search_path) made a profile.
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
    tokenA = await logIn(pageA, emailA);
  });

  await test.step('save the profile, with inline validation and the live column names', async () => {
    await pageA.goto('/profile');
    await pageA.getByPlaceholder('First name').fill('J0hn');
    await pageA.getByPlaceholder('Last name').fill("O'Brien");
    await pageA.getByRole('button', { name: 'Save Settings' }).click();
    await expect(pageA.getByRole('alert').filter({ hasText: 'Names can only contain' })).toBeVisible();

    await pageA.getByPlaceholder('First name').fill('Zoë');
    await pageA.getByRole('button', { name: 'Save Settings' }).click();
    await expect(pageA.getByRole('status')).toContainText('updated successfully');

    const response = await pageA.request.get(
      `${SUPABASE}/rest/v1/profiles?select=firstname,lastname`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` } },
    );
    expect(await response.json()).toEqual([{ firstname: 'Zoë', lastname: "O'Brien" }]);
    await pageA.goto('/home');
  });

  await test.step('generate an itinerary (mocked Gemini)', async () => {
    await pageA.getByPlaceholder('Destination (e.g., Paris)').fill('Lisbon');
    await pageA.getByPlaceholder('Interests (e.g. culture, food, adventure)').fill('food, trams');
    await pageA.getByRole('button', { name: 'Generate Itinerary' }).click();
    await expect(pageA.getByText('Mock activity 1.1')).toBeVisible();
  });

  // The form's default range is today to today, which is what was generated for.
  const generatedDay = localDay(new Date());

  await test.step('changing the dates after generating does not change what is saved', async () => {
    // Pick the 10th to the 12th of next month in the calendar.
    await pageA.getByText('📅').click();
    await pageA.locator('.rdrNextButton').click();
    const days = pageA.locator('.rdrDay:not(.rdrDayPassive) .rdrDayNumber');
    await days.getByText('10', { exact: true }).click();
    await days.getByText('12', { exact: true }).click();
    await pageA.getByRole('button', { name: 'Done' }).click();

    // The form now shows other dates, and the page says which ones the itinerary is for.
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const month = next.toLocaleString('en-US', { month: 'short' });
    await expect(pageA.getByText(`📅 ${month} 10, ${next.getFullYear()} – ${month} 12, ${next.getFullYear()}`)).toBeVisible();
    const note = pageA.getByRole('note');
    await expect(note).toContainText('The form has changed since this itinerary was generated');
    await expect(note).toContainText('Lisbon');
  });

  let tripId;
  await test.step('save it', async () => {
    const saved = pageA.waitForResponse(
      (r) => r.url() === `${API}/api/v1/trips` && r.request().method() === 'POST',
    );
    await pageA.getByRole('button', { name: 'Save to My Trips' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const savedTrip = await response.json();
    tripId = savedTrip.id;
    await expect(pageA.getByRole('status')).toContainText('saved to your dashboard');

    // Sent and stored with the dates and interests the itinerary was generated for.
    const sent = JSON.parse(response.request().postData());
    expect(sent).toMatchObject({
      destination: 'Lisbon',
      start_date: generatedDay,
      end_date: generatedDay,
      interests: ['food', 'trams'],
    });
    expect(savedTrip).toMatchObject({ start_date: generatedDay, end_date: generatedDay });
  });

  await test.step('edit it, and the edit survives a reload', async () => {
    await pageA.goto('/trips');
    await pageA.getByText('📍 Lisbon').click();
    // The saved trip shows the original dates, not the ones picked afterwards.
    await expect(pageA.getByText(`Dates: ${generatedDay} to ${generatedDay}`)).toBeVisible();
    await pageA.getByRole('button', { name: /Edit Trip/ }).click();
    await pageA.locator('input[value="Mock activity 1.1"]').fill('Pastéis de Belém');
    await pageA.getByRole('button', { name: /Save Changes/ }).click();
    await expect(pageA.getByRole('status')).toContainText('updated successfully');

    await pageA.reload();
    await pageA.getByText('📍 Lisbon').click();
    await expect(pageA.getByText('Pastéis de Belém')).toBeVisible();
  });

  await test.step('a second account cannot see or change the first account trips', async () => {
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const tokenB = await signUp(pageB, newEmail('b'));

    await pageB.goto('/trips');
    await expect(pageB.getByText("You haven't saved any itineraries yet.")).toBeVisible();
    await expect(pageB.getByText('📍 Lisbon')).toHaveCount(0);

    // Straight to the API with B's own token and A's trip id.
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
    // Step one only asks: the trip is still there and nothing was sent.
    await pageA.getByRole('button', { name: '🗑️ Delete' }).click();
    await expect(pageA.getByRole('button', { name: 'Confirm delete' })).toBeVisible();
    await pageA.getByRole('button', { name: 'Cancel' }).click();
    await expect(pageA.getByRole('button', { name: 'Confirm delete' })).toHaveCount(0);
    await expect(pageA.getByText('Pastéis de Belém')).toBeVisible();
    expect(requestsA.filter((request) => request.method === 'DELETE')).toHaveLength(0);

    // Step two deletes.
    await pageA.getByRole('button', { name: '🗑️ Delete' }).click();
    await pageA.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(pageA.getByRole('status')).toContainText('removed');
    await expect(pageA.getByText("You haven't saved any itineraries yet.")).toBeVisible();
    expect(requestsA.filter((request) => request.method === 'DELETE')).toHaveLength(1);
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

  await test.step('no alert or confirm dialog was opened', async () => {
    expect(dialogsA).toEqual([]);
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
