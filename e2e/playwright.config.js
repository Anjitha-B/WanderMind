// End-to-end tests against the local Supabase stack. See the README.
const { defineConfig } = require('@playwright/test');

const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
if (!anonKey) throw new Error('Set SUPABASE_TEST_ANON_KEY (see the README)');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const API_URL = 'http://127.0.0.1:8100';
const APP_URL = 'http://localhost:3100';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: APP_URL, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `${process.env.E2E_PYTHON || 'python3'} -m uvicorn e2e_server:app --app-dir ../e2e --port 8100`,
      cwd: '../backend',
      url: `${API_URL}/docs`,
      reuseExistingServer: false,
      env: {
        WANDERMIND_ENV_FILE: '/dev/null',
        GEMINI_API_KEY: 'e2e-unused',
        TAVILY_API_KEY: 'e2e-unused',
        SUPABASE_URL,
        SUPABASE_ANON_KEY: anonKey,
        ALLOWED_ORIGINS: APP_URL,
      },
    },
    {
      // Shell variables take precedence over frontend/.env.local.
      command: 'npx next build && npx next start -p 3100',
      cwd: '../frontend',
      url: `${APP_URL}/login`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        NEXT_PUBLIC_API_URL: API_URL,
      },
    },
  ],
});
