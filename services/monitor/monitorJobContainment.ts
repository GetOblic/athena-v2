/**
 * Job-scoped failure policy for the dedicated Monitor worker.
 * attempt_count increments on every claim, including a normal batch yield
 * and lease recovery. It is not a count of execution failures and must not
 * be used as a retry ceiling for a long catalog.
 * This module does not claim a job or open a database connection.
 */

import { boundMonitorDiagnostic, type BoundedMonitorDiagnostic } from "@/services/monitor/monitorDiagnostics";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";

export const MONITOR_JOB_FAILURE_FINALIZE_ATTEMPTS = 3;
export const MONITOR_CLAIM_BACKOFF_CAP_MS = 8000;
/** Tracked claim failures stop growing once the backoff cap is reached. */
export const MONITOR_CLAIM_BACKOFF_MAX_STEP = 4;

const RECLAIM_WITHOUT_TERMINAL = new Set(["STALE_CLAIM", "BATCH_DEADLINE", "EXECUTION_DEADLINE"]);

export type MonitorJobFailureDisposition = "reclaim" | "cancelled" | "entitlement" | "deterministic";

export function monitorFailureBackoffMs(attempt: number): number {
  const exponent = Math.min(Math.max(Math.floor(attempt) - 1, 0), 3);
  return Math.min(1000 * 2 ** exponent, 8000);
}

/** 1s, 2s, 4s, then a bounded 8s. Claim failures do not exit the worker. */
export function monitorClaimBackoffMs(consecutiveFailures: number): number {
  if (!Number.isFinite(consecutiveFailures)) return MONITOR_CLAIM_BACKOFF_CAP_MS;
  const step = Math.min(Math.max(Math.floor(consecutiveFailures), 1), MONITOR_CLAIM_BACKOFF_MAX_STEP);
  return monitorFailureBackoffMs(step);
}

export function monitorJobFailureDisposition(error: unknown): MonitorJobFailureDisposition {
  if (error instanceof MonitorOperationError) {
    if (RECLAIM_WITHOUT_TERMINAL.has(error.code)) return "reclaim";
    if (error.code === "CANCELLED") return "cancelled";
    if (error.code === "ENTITLEMENT_REQUIRED") return "entitlement";
  }
  return "deterministic";
}

export function monitorJobFailureDiagnostic(error: unknown): BoundedMonitorDiagnostic {
  if (error instanceof MonitorOperationError && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) {
    return boundMonitorDiagnostic({
      errorCode: error.code,
      errorMessage: "The search could not continue.",
      errorMetadata: {
        failureClass: "deterministic",
        operationCode: error.code,
        ...(error.metadata ?? {}),
      },
    });
  }
  return boundMonitorDiagnostic({
    errorCode: "JOB_EXECUTION_FAILED",
    errorMessage: "The search could not continue.",
    errorMetadata: { failureClass: "deterministic" },
  });
}
