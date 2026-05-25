import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 30000,
  webServer: {
    command: "npm run dev -w apps/desktop -- --port 5174",
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  },
  use: {
    baseURL: "http://127.0.0.1:5174/"
  }
});
