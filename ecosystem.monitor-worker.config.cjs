/**
 * Dedicated PM2 definition for the Monitor worker.
 *
 * Do NOT apply in production until explicitly approved.
 * Do NOT add this process to ecosystem.config.cjs.
 * Starting or reloading athena-v2 or athena-v2-worker must not start it.
 *
 * Process name: athena-v2-monitor-worker
 * Entrypoint: dist/worker/athenaMonitorWorker.js
 * Build: npm run build:monitor-worker
 *
 * ATHENA_APP_PATH is required. This file has no default application path.
 * Supply the documented production root explicitly:
 *   /home/master/applications/esusfxktea/public_html
 *
 * Secrets stay in the existing server environment. Do not copy them here.
 */
const path = require("path");
const fs = require("fs");

const WORKER_SCRIPT_RELATIVE = "dist/worker/athenaMonitorWorker.js";
const UNAUTHORIZED_APPLICATION_ID = "znfjdnxytk";

function fail(message) {
  throw new Error(message);
}

function targetsUnauthorizedApplication(candidate) {
  return candidate.split(/[\\/]+/).includes(UNAUTHORIZED_APPLICATION_ID);
}

const rawAppPath = process.env.ATHENA_APP_PATH;

if (typeof rawAppPath !== "string" || rawAppPath.trim() === "") {
  fail(
    "ATHENA_APP_PATH is required and has no default. Set ATHENA_APP_PATH to the Athena application root before loading the Monitor PM2 configuration.",
  );
}

const configuredAppPath = rawAppPath.trim();

if (targetsUnauthorizedApplication(configuredAppPath)) {
  fail(
    "Unauthorized Athena application path. Set ATHENA_APP_PATH to an explicit authorized application root.",
  );
}

if (configuredAppPath.includes("YOUR_APP")) {
  fail(
    "Unsafe Athena PM2 path placeholder detected. Set ATHENA_APP_PATH to the real application root.",
  );
}

if (!path.isAbsolute(configuredAppPath)) {
  fail(
    `ATHENA_APP_PATH must be an absolute application root. Received: ${configuredAppPath}`,
  );
}

const appPath = path.resolve(configuredAppPath);

if (targetsUnauthorizedApplication(appPath)) {
  fail(
    "Unauthorized Athena application path. Set ATHENA_APP_PATH to an explicit authorized application root.",
  );
}

if (!fs.existsSync(appPath)) {
  fail(
    `Athena application path does not exist: ${appPath}. Set ATHENA_APP_PATH correctly before starting PM2.`,
  );
}

const workerScript = path.resolve(appPath, WORKER_SCRIPT_RELATIVE);
const workerScriptFromRoot = path.relative(appPath, workerScript);

if (workerScriptFromRoot !== WORKER_SCRIPT_RELATIVE || workerScriptFromRoot.startsWith("..")) {
  fail(
    `Monitor worker script resolved outside the authorized application root: ${workerScript}`,
  );
}

if (!fs.existsSync(workerScript)) {
  fail(
    `Monitor worker bundle not found at ${workerScript}. Run npm run build:monitor-worker in ${appPath} before starting athena-v2-monitor-worker.`,
  );
}

module.exports = {
  apps: [
    {
      name: "athena-v2-monitor-worker",
      cwd: appPath,
      script: WORKER_SCRIPT_RELATIVE,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      kill_timeout: 100000,
      env: {
        NODE_ENV: "production",
        ATHENA_APP_PATH: appPath,
      },
    },
  ],
};
