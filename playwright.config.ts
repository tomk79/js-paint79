import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /dist\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: /dist\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /dist\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // ビルド成果物のスモークテスト
      name: 'dist',
      testMatch: /dist\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // 127.0.0.1 で待ち受ける。テストのページは localhost で開くため、127.0.0.1 からの読み込みを
    // 別オリジンとして扱える(汚染された画像のテストで使う)
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/e2e/pages/index.html`,
    reuseExistingServer: false,
  },
});
