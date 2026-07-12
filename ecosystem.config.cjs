/**
 * Production PM2 ecosystem definition for Athena V3.
 *
 * Do NOT apply in production until explicitly approved.
 *
 * Conceptual processes:
 * - athena         → Next.js web application (existing)
 * - athena-worker  → durable generation job worker (new)
 */
module.exports = {
  apps: [
    {
      name: "athena",
      cwd: "/home/master/applications/YOUR_APP/public_html",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "athena-worker",
      cwd: "/home/master/applications/YOUR_APP/public_html",
      script: "dist/worker/athenaWorker.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      kill_timeout: 100000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
