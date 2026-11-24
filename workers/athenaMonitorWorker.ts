/**
 * athena-v2-monitor-worker — dedicated Monitor execution process.
 *
 * Server-only. It does not claim Athena intelligence, deep-scrape, or generation jobs.
 * It does not edit PM2 process definitions and it does not start itself on import.
 * Future process name: athena-v2-monitor-worker.
 */
import { executeMonitorJob } from "@/services/monitor/monitorEngine";
import {
  createMonitorPageFetch,
  createMonitorResources,
  type MonitorResourceTracker,
} from "@/services/monitor/monitorHttp";
import type { MonitorPageFetch } from "@/services/monitor/monitorAdapter";
import { ATHENA_MONITOR_WORKER_DEFAULTS, ATHENA_MONITOR_WORKER_NAME } from "@/services/monitor/monitorRuntime";
import type { MonitorService } from "@/services/monitor/monitorService";
import type { MonitorStore } from "@/services/monitor/monitorStore";
import { isTerminalMonitorStatus } from "@/services/monitor/monitorTypes";

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
  try {
    while (!input.shouldStop()) {
      const claimed = await input.service.claimNextMonitorJob({
        workerId: ATHENA_MONITOR_WORKER_NAME,
      });
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
    }
  } finally {
    if (input.closeOnStop || !input.resources) resources.close();
  }
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
