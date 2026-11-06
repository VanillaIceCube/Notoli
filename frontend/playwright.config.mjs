import { defineConfig } from '@playwright/test';

if (!process.env.E2E_STATE_DIR)
  throw new Error('Use npm run test:e2e for disposable state and cleanup');

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  globalTimeout: 600000,
  timeout: 45000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'python ../scripts/e2e_backend.py',
      // Playwright accepts 200 <= status < 404: the expected unauthenticated 401 proves Django is listening.
      url: 'http://127.0.0.1:8001/api/notifications/',
      reuseExistingServer: false,
      timeout: 120000,
      env: { E2E_STATE_DIR: process.env.E2E_STATE_DIR },
    },
    {
      command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3001`,
      url: 'http://127.0.0.1:3001',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:8001',
        REACT_APP_API_BASE_URL: 'http://127.0.0.1:8001',
      },
    },
  ],
});
