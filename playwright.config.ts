import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROME_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4180/saleslab/", launchOptions, trace: "off" },
  webServer: {
    command: "npx vite preview --port 4180 --strictPort --base /saleslab/",
    url: "http://localhost:4180/saleslab/",
    reuseExistingServer: true,
    env: { PAGES: "1" },
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" } },
  ],
});
