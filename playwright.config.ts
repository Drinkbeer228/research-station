import { defineConfig, devices } from '@playwright/test';

// The preview serves the production build under the site's base path. The library's own data comes from
// `tests/e2e/fixtures/library`, put in place by `page.route` in the specs.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317/research-station/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317/research-station/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /touch\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /touch\.spec\.ts/ },
  ],
});
