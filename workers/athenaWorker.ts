/**
 * athena-worker — dedicated durable generation job processor.
 *
 * Server-only. No Next.js request context. No after(). No React.
 */
import {
  claimAndExecuteNextJob,
  createWorkerIdentity,
} from "@/services/generationJobs/generationJobExecutor";
import {
  getAthenaWorkerConfig,
  resetAthenaWorkerConfigCache,
} from "@/services/generationJobs/generationJobWorkerConfig";
import { logChromiumAvailabilityAtStartup } from "@/services/websiteLearning/deepScrape/crawler/chromiumCheck";
import {
  claimAndExecuteNextDeepScrapeJob,
  reconcileAwaitingFollowOnJobs,
} from "@/services/websiteLearning/deepScrape/deepScrapeExecutor";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error("Missing required environment variable: OPENROUTER_API_KEY");
  }

  resetAthenaWorkerConfigCache();
  const config = getAthenaWorkerConfig();

  if (config.concurrency !== 1) {
    throw new Error("athena-worker concurrency must be 1 in V3.2");
  }

  const workerId = createWorkerIdentity();
  let stopping = false;
  let currentWork: Promise<boolean> | null = null;

  console.log("[ATHENA_WORKER] worker_started", {
    workerId,
    pid: process.pid,
    pollIntervalMs: config.pollIntervalMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    leaseSeconds: config.leaseSeconds,
    maxAttempts: config.maxAttempts,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
    concurrency: config.concurrency,
  });

  // Soft check — Cheerio path still works if Chromium is missing.
  await logChromiumAvailabilityAtStartup();

  const beginShutdown = (signal: string) => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.log("[ATHENA_WORKER] worker_stopping", { workerId, signal });
  };

  process.on("SIGTERM", () => beginShutdown("SIGTERM"));
  process.on("SIGINT", () => beginShutdown("SIGINT"));

  while (!stopping) {
    try {
      // Finalize Prospect deep-scrape jobs waiting on generation (non-blocking).
      await reconcileAwaitingFollowOnJobs();

      // Process generation jobs first so Prospect deep-scrape follow-ons are not starved.
      const work = claimAndExecuteNextJob(workerId, {
        shouldStop: () => stopping,
      });
      currentWork = work;
      const didWork = await work;
      currentWork = null;

      if (didWork) {
        continue;
      }

      const deepWork = claimAndExecuteNextDeepScrapeJob(workerId, {
        shouldStop: () => stopping,
      });
      currentWork = deepWork;
      const didDeepWork = await deepWork;
      currentWork = null;

      if (!didDeepWork) {
        await sleep(config.pollIntervalMs);
      }
    } catch (error) {
      currentWork = null;
      console.error("[ATHENA_WORKER] loop_error", {
        workerId,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(config.pollIntervalMs);
    }
  }

  if (currentWork) {
    const grace = sleep(config.shutdownTimeoutMs);
    await Promise.race([
      currentWork.then(
        () => undefined,
        () => undefined,
      ),
      grace,
    ]);
  }

  console.log("[ATHENA_WORKER] worker_stopped", { workerId });
}

main().catch((error) => {
  console.error("[ATHENA_WORKER] fatal_startup_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
