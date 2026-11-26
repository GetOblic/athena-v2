/**
 * athena-v2-monitor-worker — dedicated Monitor execution process.
 *
 * Server-only. It does not claim Athena intelligence, deep-scrape, or generation jobs.
 * It does not edit PM2 process definitions and it does not start itself on import.
 * Future process name: athena-v2-monitor-worker.
 */
import { executeMonitorJob } from "@/services/monitor/monitorEngine";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import {
  createMonitorPageFetch,
  createMonitorResources,
  type MonitorResourceTracker,
} from "@/services/monitor/monitorHttp";
import type { MonitorPageFetch } from "@/services/monitor/monitorAdapter";
import {
  MONITOR_CLAIM_BACKOFF_CAP_MS,
  MONITOR_CLAIM_BACKOFF_MAX_STEP,
  MONITOR_JOB_FAILURE_FINALIZE_ATTEMPTS,
  monitorClaimBackoffMs,
  monitorFailureBackoffMs,
  monitorJobFailureDiagnostic,
  monitorJobFailureDisposition,
} from "@/services/monitor/monitorJobContainment";
import { ATHENA_MONITOR_WORKER_DEFAULTS, ATHENA_MONITOR_WORKER_NAME } from "@/services/monitor/monitorRuntime";
import type { MonitorService } from "@/services/monitor/monitorService";
import type { MonitorStore } from "@/services/monitor/monitorStore";
import { isTerminalMonitorStatus, type MonitorJob } from "@/services/monitor/monitorTypes";

export function bindMonitorWorkerSignals(onStop: () => void): () => void {
  const stop = () => onStop();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return () => {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  };
}

export async function runAthenaMonitorWorker(input: {
  service: MonitorService;
  store: MonitorStore;
  fetchPage?: MonitorPageFetch;
  resources?: MonitorResourceTracker;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  shouldStop: () => boolean;
  forceFresh?: boolean;
  closeOnStop?: boolean;
  pollIntervalMs?: number;
}): Promise<void> {
  const resources = input.resources ?? createMonitorResources();
  const fetchPage = input.fetchPage ?? createMonitorPageFetch(resources);
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pollIntervalMs = input.pollIntervalMs ?? ATHENA_MONITOR_WORKER_DEFAULTS.pollIntervalMs;
  let consecutiveClaimFailures = 0;
  let claimOutageAnnounced = false;
  let claimCapAnnounced = false;
  try {
    while (!input.shouldStop()) {
      let claimed: Awaited<ReturnType<MonitorService["claimNextMonitorJob"]>>;
      try {
        claimed = await input.service.claimNextMonitorJob({
          workerId: ATHENA_MONITOR_WORKER_NAME,
        });
        if (consecutiveClaimFailures > 0) {
          console.error("[ATHENA_MONITOR_WORKER] claim_recovered");
        }
        consecutiveClaimFailures = 0;
        claimOutageAnnounced = false;
        claimCapAnnounced = false;
      } catch {
        consecutiveClaimFailures = Math.min(consecutiveClaimFailures + 1, MONITOR_CLAIM_BACKOFF_MAX_STEP);
        const delay = monitorClaimBackoffMs(consecutiveClaimFailures);
        if (!claimOutageAnnounced || (delay >= MONITOR_CLAIM_BACKOFF_CAP_MS && !claimCapAnnounced)) {
          console.error("[ATHENA_MONITOR_WORKER] claim_unavailable", { backoffMs: delay });
          if (delay >= MONITOR_CLAIM_BACKOFF_CAP_MS) claimCapAnnounced = true;
          claimOutageAnnounced = true;
        }
        await sleep(delay);
        if (input.shouldStop()) break;
        continue;
      }
      if (input.shouldStop()) {
        if (
          claimed &&
          claimed.disposition === "claimed" &&
          claimed.job.claimToken &&
          !isTerminalMonitorStatus(claimed.job.status)
        ) {
          await input.service.yieldMonitorJob({
            jobId: claimed.job.id,
            claimToken: claimed.job.claimToken,
          });
        }
        break;
      }
      if (!claimed) {
        await sleep(pollIntervalMs);
        continue;
      }
      if (claimed.disposition !== "claimed" || isTerminalMonitorStatus(claimed.job.status)) {
        continue;
      }
      try {
        const result = await executeMonitorJob({
          service: input.service,
          store: input.store,
          job: claimed.job,
          fetchPage,
          now: input.now,
          shouldStop: input.shouldStop,
          forceFresh: input.forceFresh === true || claimed.job.progress.forceFresh === true,
          resources,
        });
        if (result.outcome === "interrupted") break;
      } catch (error) {
        const contained = await containClaimedJobFailure({
          service: input.service,
          job: claimed.job,
          error,
          sleep,
        });
        if (contained === "reclaim") continue;
      }
    }
  } finally {
    if (input.closeOnStop || !input.resources) resources.close();
  }
}

async function containClaimedJobFailure(input: {
  service: MonitorService;
  job: MonitorJob;
  error: unknown;
  sleep: (milliseconds: number) => Promise<void>;
}): Promise<"contained" | "reclaim" | "unrecorded"> {
  const disposition = monitorJobFailureDisposition(input.error);
  if (disposition === "reclaim" || !input.job.claimToken) {
    console.error("[ATHENA_MONITOR_WORKER] job_left_for_lease_recovery", {
      jobId: input.job.id,
      errorCode: input.error instanceof MonitorOperationError ? input.error.code : "JOB_EXECUTION_FAILED",
    });
    return "reclaim";
  }
  const diagnostic = monitorJobFailureDiagnostic(input.error);
  const status = disposition === "cancelled" ? "cancelled" : disposition === "entitlement" ? "blocked" : "failed";
  for (let attempt = 1; attempt <= MONITOR_JOB_FAILURE_FINALIZE_ATTEMPTS; attempt += 1) {
    try {
      await input.service.finalizeMonitorJob({
        jobId: input.job.id,
        claimToken: input.job.claimToken,
        status,
        errorCode: diagnostic.errorCode,
        errorMessage: diagnostic.errorMessage,
        errorMetadata: diagnostic.errorMetadata,
        sourceCoverage: input.job.sourceCoverage,
        progress: input.job.progress,
        executionCursor: input.job.executionCursor,
      });
      console.error("[ATHENA_MONITOR_WORKER] job_failed", {
        jobId: input.job.id,
        errorCode: diagnostic.errorCode,
        status,
      });
      return "contained";
    } catch (finalizeError) {
      if (finalizeError instanceof MonitorOperationError && finalizeError.code === "STALE_CLAIM") {
        console.error("[ATHENA_MONITOR_WORKER] stale_claim_not_finalized", {
          jobId: input.job.id,
          errorCode: diagnostic.errorCode,
        });
        return "reclaim";
      }
      if (attempt === MONITOR_JOB_FAILURE_FINALIZE_ATTEMPTS) {
        console.error("[ATHENA_MONITOR_WORKER] job_failure_unrecorded", {
          jobId: input.job.id,
          errorCode: diagnostic.errorCode,
          attempts: attempt,
        });
        return "unrecorded";
      }
      await input.sleep(monitorFailureBackoffMs(attempt));
    }
  }
  return "unrecorded";
}

const DIRECT_FLAG = "__ATHENA_MONITOR_WORKER_DIRECT__";
const RUNTIME_FLAG = "__ATHENA_MONITOR_WORKER_RUNTIME__";

type MonitorWorkerRuntime = {
  run(shouldStop: () => boolean): Promise<void>;
};

function globalRecord(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

/**
 * The production bundle is CommonJS. import.meta is empty there, so a URL
 * comparison would exit before the runtime starts. The build prepends a
 * require.main check that sets DIRECT_FLAG only for the real process entry.
 * Importing the module leaves the flag unset and does not start the runtime.
 */
function invokedDirectly(): boolean {
  return globalRecord()[DIRECT_FLAG] === true;
}

function runtimeOverride(): (() => Promise<MonitorWorkerRuntime>) | null {
  const value = globalRecord()[RUNTIME_FLAG];
  return typeof value === "function" ? (value as () => Promise<MonitorWorkerRuntime>) : null;
}

async function createSupabaseMonitorWorkerRuntime(): Promise<MonitorWorkerRuntime> {
  const [{ createSupabaseMonitorStore }, { createMonitorService }, { defaultResolveMonitorPlan }] =
    await Promise.all([
      import("@/services/monitor/monitorSupabaseStore"),
      import("@/services/monitor/monitorService"),
      import("@/services/monitor/monitorAuthorization"),
    ]);
  const store = await createSupabaseMonitorStore();
  const service = createMonitorService({
    store,
    resolvePlan: defaultResolveMonitorPlan,
  });
  return {
    async run(shouldStop) {
      await runAthenaMonitorWorker({
        service,
        store,
        shouldStop,
        closeOnStop: true,
      });
    },
  };
}

async function main(): Promise<void> {
  const override = runtimeOverride();
  const runtime = override ? await override() : await createSupabaseMonitorWorkerRuntime();
  let stopping = false;
  const unbind = bindMonitorWorkerSignals(() => {
    stopping = true;
  });
  console.log("[ATHENA_MONITOR_WORKER] worker_started", {
    workerId: ATHENA_MONITOR_WORKER_NAME,
    pid: process.pid,
    concurrency: ATHENA_MONITOR_WORKER_DEFAULTS.concurrency,
    batchSize: ATHENA_MONITOR_WORKER_DEFAULTS.batchSize,
    pollIntervalMs: ATHENA_MONITOR_WORKER_DEFAULTS.pollIntervalMs,
  });
  try {
    await runtime.run(() => stopping);
  } finally {
    unbind();
    console.log("[ATHENA_MONITOR_WORKER] worker_stopped", {
      workerId: ATHENA_MONITOR_WORKER_NAME,
    });
  }
}

if (invokedDirectly()) {
  main().catch((error: unknown) => {
    console.error("[ATHENA_MONITOR_WORKER] worker_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
}
