/**
 * Centralized operational configuration for athena-worker.
 * Server-only. Retry backoff delays remain business-logic constants elsewhere.
 */

export type AthenaWorkerRuntimeConfig = {
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  leaseSeconds: number;
  maxAttempts: number;
  shutdownTimeoutMs: number;
  concurrency: number;
};

export const ATHENA_WORKER_CONFIG_DEFAULTS: AthenaWorkerRuntimeConfig = {
  pollIntervalMs: 3_000,
  heartbeatIntervalMs: 20_000,
  leaseSeconds: 120,
  maxAttempts: 3,
  shutdownTimeoutMs: 90_000,
  concurrency: 1,
};

function parseInteger(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw == null || String(raw).trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    console.warn(
      `[ATHENA_WORKER] Invalid integer for ${name}=${raw}; using default ${fallback}`,
    );
    return fallback;
  }

  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve and validate worker timing/concurrency.
 * Invalid values fall back to safe defaults; concurrency is forced to 1.
 */
export function resolveAthenaWorkerConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AthenaWorkerRuntimeConfig {
  const defaults = ATHENA_WORKER_CONFIG_DEFAULTS;

  const pollIntervalMs = clamp(
    parseInteger(env, "ATHENA_WORKER_POLL_INTERVAL_MS", defaults.pollIntervalMs),
    500,
    60_000,
  );
  let heartbeatIntervalMs = clamp(
    parseInteger(
      env,
      "ATHENA_WORKER_HEARTBEAT_INTERVAL_MS",
      defaults.heartbeatIntervalMs,
    ),
    5_000,
    120_000,
  );
  const leaseSeconds = clamp(
    parseInteger(env, "ATHENA_WORKER_LEASE_SECONDS", defaults.leaseSeconds),
    30,
    600,
  );
  const maxAttempts = clamp(
    parseInteger(env, "ATHENA_WORKER_MAX_ATTEMPTS", defaults.maxAttempts),
    1,
    10,
  );
  let shutdownTimeoutMs = clamp(
    parseInteger(
      env,
      "ATHENA_WORKER_SHUTDOWN_TIMEOUT_MS",
      defaults.shutdownTimeoutMs,
    ),
    5_000,
    600_000,
  );
  const concurrencyRaw = parseInteger(
    env,
    "ATHENA_WORKER_CONCURRENCY",
    defaults.concurrency,
  );

  // Heartbeat must be safely shorter than half the lease.
  const maxHeartbeatMs = Math.floor((leaseSeconds * 1000) / 2);
  if (heartbeatIntervalMs >= maxHeartbeatMs) {
    const clamped = Math.max(5_000, maxHeartbeatMs - 1);
    console.warn(
      `[ATHENA_WORKER] Heartbeat ${heartbeatIntervalMs}ms is too long for lease ${leaseSeconds}s; clamping to ${clamped}ms`,
    );
    heartbeatIntervalMs = clamped;
  }

  if (shutdownTimeoutMs < heartbeatIntervalMs) {
    console.warn(
      `[ATHENA_WORKER] Shutdown timeout ${shutdownTimeoutMs}ms < heartbeat; raising to ${heartbeatIntervalMs}ms`,
    );
    shutdownTimeoutMs = heartbeatIntervalMs;
  }

  if (concurrencyRaw !== 1) {
    console.warn(
      `[ATHENA_WORKER] Concurrency ${concurrencyRaw} is not supported in V3.2; forcing 1`,
    );
  }

  return {
    pollIntervalMs,
    heartbeatIntervalMs,
    leaseSeconds,
    maxAttempts,
    shutdownTimeoutMs,
    concurrency: 1,
  };
}

let cachedConfig: AthenaWorkerRuntimeConfig | null = null;

export function getAthenaWorkerConfig(): AthenaWorkerRuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = resolveAthenaWorkerConfig();
  }
  return cachedConfig;
}

/** Test helper — clear memoized config after env changes. */
export function resetAthenaWorkerConfigCache(): void {
  cachedConfig = null;
}

/**
 * Product rule: any new executive enqueue against an active job
 * (queued / processing / retryable) must set the coalesced follow-up marker
 * so Refresh / Append / Import intent is never silently lost.
 */
export function shouldRequestFollowUpWhenActiveJobExists(): boolean {
  return true;
}
