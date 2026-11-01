import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// The tests run their own backend and dashboard, on ports apart from `npm run dev`,
// with a fresh database and the stand-in model in place of a real one.
const apiPort = "8100";
const dashboardPort = "5174";
const database = path.join(
  os.tmpdir(),
  `undercover-e2e-${String(Date.now())}.db`,
);

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: "list",
  use: { baseURL: `http://localhost:${dashboardPort}` },
  webServer: [
    {
      command: `uv run -m uvicorn backend.main:app --port ${apiPort}`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      env: {
        ...process.env,
        UNDERCOVER_DB: database,
        UNDERCOVER_STAND_IN: "1",
        UNDERCOVER_BACKEND: `http://127.0.0.1:${apiPort}`,
      },
    },
    {
      command: `npx vite dashboard --port ${dashboardPort} --strictPort`,
      url: `http://localhost:${dashboardPort}`,
      reuseExistingServer: false,
      env: { ...process.env, UNDERCOVER_API: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
