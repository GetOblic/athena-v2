/**
 * Production PM2 ecosystem definition for Athena V3.
 *
 * Do NOT apply in production until explicitly approved.
 *
 * Process names (must not change):
 * - athena         → Next.js web application
 * - athena-worker  → durable generation job worker
 *
 * Application path:
 * - Prefer ATHENA_APP_PATH
 * - Default: /home/master/applications/znfjdnxytk/public_html
 */
const path = require("path");
const fs = require("fs");

const DEFAULT_ATHENA_APP_PATH =
  "/home/master/applications/znfjdnxytk/public_html";

const appPath = (
  process.env.ATHENA_APP_PATH || DEFAULT_ATHENA_APP_PATH
).trim();

if (!appPath) {
  throw new Error(
    "ATHENA_APP_PATH resolved to an empty path. Set ATHENA_APP_PATH to the Athena application root.",
  );
}

if (appPath.includes("YOUR_APP")) {
  throw new Error(
    "Unsafe Athena PM2 path placeholder detected. Set ATHENA_APP_PATH to the real application root.",
  );
}

if (!fs.existsSync(appPath)) {
  throw new Error(
    `Athena application path does not exist: ${appPath}. Set ATHENA_APP_PATH correctly before starting PM2.`,
  );
}

const nextBin = path.join(appPath, "node_modules/next/dist/bin/next");

if (!fs.existsSync(nextBin)) {
  throw new Error(
    `Next.js binary not found at ${nextBin}. Build/install dependencies in ${appPath} before starting athena.`,
  );
}

module.exports = {
  apps: [
    {
      name: "athena-v2",
      cwd: appPath,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        ATHENA_APP_PATH: appPath,
      },
    },
    {
      name: "athena-v2-worker",
      cwd: appPath,
      script: "dist/worker/athenaWorker.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      kill_timeout: 100000,
      env: {
        NODE_ENV: "production",
        ATHENA_APP_PATH: appPath,
        ATHENA_WORKER_CONCURRENCY: "1",
      },
    },
  ],
};
