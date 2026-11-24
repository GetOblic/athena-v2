/**
 * Proposed runtime defaults for the future athena-v2-monitor-worker process.
 * This module does not start a process, open a database, or edit PM2.
 */

export const ATHENA_MONITOR_WORKER_NAME = "athena-v2-monitor-worker";

export const ATHENA_MONITOR_WORKER_DEFAULTS = {
  concurrency: 1,
  batchSize: 20,
  pollIntervalMs: 3_000,
  heartbeatIntervalMs: 20_000,
  leaseSeconds: 120,
  /**
   * One public page request. It cannot extend the batch lease or the overall deadline.
   */
  requestTimeoutMs: 20_000,
  /**
   * One batch of families. The worker yields at this bound so a large catalog
   * does not hold the single Monitor worker until the overall deadline.
   */
  batchDeadlineSeconds: 10 * 60,
  /**
   * Overall bound, measured from the first successful claim.
   * Thirty minutes cannot finish a complete large catalog.
   * Reclaim, heartbeat, and batch yield cannot move this instant later.
   */
  executionDeadlineSeconds: 6 * 60 * 60,
} as const;

export const ATHENA_MONITOR_FRESHNESS = {
  categoryDiscoveryMs: 7 * 24 * 60 * 60 * 1000,
  catalogDiscoveryMs: 24 * 60 * 60 * 1000,
  productObservationMs: 24 * 60 * 60 * 1000,
} as const;

export const MONITOR_MAX_DIAGNOSTIC_MESSAGE = 500;
export const MONITOR_MAX_DIAGNOSTIC_METADATA_CHARS = 2_000;
export const MONITOR_MAX_OBSERVATION_PAYLOAD_CHARS = 20_000;

export function assertMonitorBatchBound(size: number): void {
  if (!Number.isInteger(size) || size < 0 || size > ATHENA_MONITOR_WORKER_DEFAULTS.batchSize) {
    throw new Error("MONITOR_BATCH_BOUND");
  }
}
