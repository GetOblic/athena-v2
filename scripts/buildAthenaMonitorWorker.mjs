/**
 * Bundles the dedicated Monitor worker.
 * Run: node scripts/buildAthenaMonitorWorker.mjs
 * This does not start the worker and does not change the Athena intelligence worker build.
 */
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(root, "workers/athenaMonitorWorker.ts")],
  outfile: path.join(root, "dist/worker/athenaMonitorWorker.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  packages: "external",
  alias: {
    "@": root,
  },
  // CommonJS has no import.meta. This flag is true only when Node executes
  // the bundle as the process entry, so requiring the file does not boot it.
  banner: {
    js: "globalThis.__ATHENA_MONITOR_WORKER_DIRECT__ = require.main === module;",
  },
  logLevel: "info",
});

console.log("[athena-monitor-worker] built dist/worker/athenaMonitorWorker.js");
