import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  projects: [
    {
      name: "renderer",
      testMatch: /desktop-preview\.spec\.ts$/,
      use: {
        baseURL: "http://127.0.0.1:5174/",
      },
    },
    {
      name: "visual",
      testMatch: /visual-smoke\.spec\.ts$/,
      use: {
        baseURL: "http://127.0.0.1:5174/",
      },
    },
    {
      name: "electron",
      testMatch: /desktop-electron\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "npm run dev -w apps/desktop -- --port 5174",
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
