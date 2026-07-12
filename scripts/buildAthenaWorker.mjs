/**
 * Bundles the athena-worker entrypoint for production PM2 execution.
 * Run: node scripts/buildAthenaWorker.mjs
 */
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(root, "workers/athenaWorker.ts")],
  outfile: path.join(root, "dist/worker/athenaWorker.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  packages: "external",
  alias: {
    "@": root,
  },
  logLevel: "info",
});

console.log("[athena-worker] built dist/worker/athenaWorker.js");
