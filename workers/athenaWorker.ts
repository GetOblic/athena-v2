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
  GENERATION_WORKER_IDLE_POLL_MS,
  GENERATION_WORKER_SHUTDOWN_GRACE_MS,
} from "@/services/generationJobs/generationJobTypes";

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
  // OpenRouter is required for generation; fail fast if absent.
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error("Missing required environment variable: OPENROUTER_API_KEY");
  }

  const workerId = createWorkerIdentity();
  let stopping = false;
  let currentWork: Promise<boolean> | null = null;

  console.log("[ATHENA_WORKER] worker_started", {
    workerId,
    pid: process.pid,
    idlePollMs: GENERATION_WORKER_IDLE_POLL_MS,
    shutdownGraceMs: GENERATION_WORKER_SHUTDOWN_GRACE_MS,
  });

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
      const work = claimAndExecuteNextJob(workerId, {
        shouldStop: () => stopping,
      });
      currentWork = work;
      const didWork = await work;
      currentWork = null;

      if (!didWork) {
        await sleep(GENERATION_WORKER_IDLE_POLL_MS);
      }
    } catch (error) {
      currentWork = null;
      console.error("[ATHENA_WORKER] loop_error", {
        workerId,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(GENERATION_WORKER_IDLE_POLL_MS);
    }
  }

  if (currentWork) {
    const grace = sleep(GENERATION_WORKER_SHUTDOWN_GRACE_MS);
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
