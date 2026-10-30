import { defineConfig, devices } from '@playwright/test';

/**
 * F4 — config dedicada à GRAVAÇÃO dos vídeos e2e (.webm → .mp4 via ffmpeg).
 * Separada da config de teste pra não ligar `video:'on'` na suíte normal.
 */
export default defineConfig({
  testDir: './e2e-record',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 240000,
  outputDir: './e2e-record/_artifacts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3002',
    viewport: { width: 1440, height: 900 },
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
