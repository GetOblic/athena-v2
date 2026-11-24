/**
 * Compiled Monitor worker entry.
 * The harness injects a runtime so the process never opens Supabase.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runAthenaMonitorWorker } from "../../workers/athenaMonitorWorker";

const ROOT = process.cwd();
const BUNDLE = path.join(ROOT, "dist/worker/athenaMonitorWorker.js");

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/supabase|service_role|openrouter|database_url/i.test(key)) {
      delete env[key];
    }
  }
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.__ATHENA_MONITOR_WORKER_RUNTIME__;
  return env;
}

function writeHarness(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "athena-monitor-worker-"));
  const file = path.join(directory, "harness.cjs");
  writeFileSync(
    file,
    `
globalThis.__ATHENA_MONITOR_WORKER_RUNTIME__ = async () => {
  const worker = require(process.env.MONITOR_WORKER_BUNDLE);
  let claims = 0;
  return {
    async run(shouldStop) {
      await worker.runAthenaMonitorWorker({
        service: {
          async claimNextMonitorJob() {
            claims += 1;
            console.log("[ATHENA_MONITOR_WORKER] test_claim " + claims);
            return null;
          },
          async yieldMonitorJob() {},
        },
        store: {},
        shouldStop,
        sleep: () => new Promise((resolve) => setTimeout(resolve, 20)),
        pollIntervalMs: 20,
        fetchPage: async () => {
          throw new Error("network");
        },
        resources: { close() {} },
        closeOnStop: false,
      });
      console.log("[ATHENA_MONITOR_WORKER] test_claims_stopped " + claims);
    },
  };
};
`,
  );
  return file;
}

function runSignal(signal: NodeJS.Signals, harness: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--require", harness, BUNDLE], {
      cwd: ROOT,
      env: { ...cleanEnv(), MONITOR_WORKER_BUNDLE: BUNDLE },
    });
    let output = "";
    let sent = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`worker did not exit after ${signal}\n${output}`));
    }, 8000);
    const receive = (chunk: Buffer) => {
      output += chunk.toString();
      if (!sent && output.includes("test_claim")) {
        sent = true;
        child.kill(signal);
      }
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describe("Monitor compiled worker entry", () => {
  it("stops a claimed job before execution when the runtime is already stopping", async () => {
    let yielded = false;
    let claims = 0;
    let stopping = false;
    await runAthenaMonitorWorker({
      service: {
        async claimNextMonitorJob() {
          claims += 1;
          stopping = true;
          return {
            disposition: "claimed",
            job: {
              id: "11111111-1111-4111-8111-111111111111",
              claimToken: "22222222-2222-4222-8222-222222222222",
              status: "processing",
              progress: {},
            },
          };
        },
        async yieldMonitorJob() {
          yielded = true;
          return null;
        },
      } as never,
      store: {} as never,
      shouldStop: () => stopping,
      sleep: async () => undefined,
      pollIntervalMs: 1,
      fetchPage: async () => {
        throw new Error("network");
      },
      resources: { close() {} } as never,
      closeOnStop: false,
    });
    assert.equal(claims, 1);
    assert.equal(yielded, true);
  });

  it("starts from the compiled entry, stays idle on import, and stops on signals", async () => {
    const build = spawnSync(process.execPath, ["scripts/buildAthenaMonitorWorker.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const buildOutput = `${build.stdout}\n${build.stderr}`;
    assert.doesNotMatch(buildOutput, /import\.meta/);
    const bundle = readFileSync(BUNDLE, "utf8");
    assert.doesNotMatch(bundle, /import\.meta/);
    assert.match(bundle, /require\.main === module/);
    assert.match(bundle, /__ATHENA_MONITOR_WORKER_DIRECT__/);

    const imported = spawnSync(
      process.execPath,
      ["-e", `require(${JSON.stringify(BUNDLE)}); console.log("imported")`],
      { cwd: ROOT, env: cleanEnv(), encoding: "utf8", timeout: 8000 },
    );
    assert.equal(imported.status, 0, imported.stderr || imported.stdout);
    assert.match(imported.stdout, /imported/);
    assert.doesNotMatch(`${imported.stdout}\n${imported.stderr}`, /worker_started/);

    const missing = spawnSync(process.execPath, [BUNDLE], {
      cwd: ROOT,
      env: cleanEnv(),
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(missing.status, 1, missing.stdout || missing.stderr);
    assert.match(`${missing.stdout}\n${missing.stderr}`, /Missing NEXT_PUBLIC_SUPABASE_URL/);
    assert.doesNotMatch(missing.stdout, /worker_started/);

    const harness = writeHarness();
    try {
      for (const signal of ["SIGTERM", "SIGINT"] as const) {
        const result = await runSignal(signal, harness);
        assert.equal(result.code, 0, result.output);
        assert.match(result.output, /worker_started/);
        assert.match(result.output, /test_claims_stopped/);
        assert.match(result.output, /worker_stopped/);
        const stoppedAt = result.output.indexOf("test_claims_stopped");
        const afterStop = result.output.slice(stoppedAt + "test_claims_stopped".length);
        assert.equal(afterStop.includes("test_claim "), false);
      }
    } finally {
      rmSync(path.dirname(harness), { recursive: true, force: true });
    }
  });
});
