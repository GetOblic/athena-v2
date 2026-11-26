/**
 * Monitor operation failures.
 * Codes are stable for the future worker and for tests.
 * This module does not read a plan, a database, or a network.
 */

export class MonitorOperationError extends Error {
  readonly code: string;
  readonly metadata: Record<string, unknown> | null;

  constructor(
    code: string,
    message = code,
    metadata: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "MonitorOperationError";
    this.code = code;
    this.metadata = metadata;
  }
}

/**
 * Composite owner foreign keys are the tenant-isolation evidence.
 * Any other SQLSTATE 23503 is an ordinary foreign-key failure.
 */
const TENANT_FOREIGN_KEYS = new Set([
  "athena_monitor_jobs_monitor_owner_fk",
  "athena_monitor_observations_job_owner_fk",
]);

const ACTIVE_JOB_CONSTRAINT = "athena_monitor_jobs_one_active_per_monitor";

export type MonitorDatabaseError = {
  code?: string;
  message?: string;
};

export function monitorConstraintName(error: MonitorDatabaseError): string | null {
  const match = (error.message ?? "").match(/(?:constraint|index) "([a-z0-9_]+)"/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}

function persistenceMetadata(error: MonitorDatabaseError): Record<string, unknown> | null {
  const constraint = monitorConstraintName(error);
  const metadata: Record<string, unknown> = {};
  if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) metadata.sqlState = error.code;
  if (constraint) metadata.constraint = constraint;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

/**
 * Maps a PostgREST/PostgreSQL error to a Monitor operation code.
 * The Error message stays generic. Sanitized sqlState and constraint stay on metadata.
 */
export function classifyMonitorDatabaseError(error: MonitorDatabaseError): MonitorOperationError {
  const constraint = monitorConstraintName(error);
  const metadata = persistenceMetadata(error);
  if (error.code === "23505") {
    if (constraint == null || constraint === ACTIVE_JOB_CONSTRAINT) {
      return new MonitorOperationError("ACTIVE_JOB_EXISTS", "ACTIVE_JOB_EXISTS", metadata);
    }
    return new MonitorOperationError(
      "CONSTRAINT_VIOLATION",
      "The request could not be saved.",
      metadata,
    );
  }
  if (error.code === "23503") {
    if (constraint != null && TENANT_FOREIGN_KEYS.has(constraint)) {
      return new MonitorOperationError("CROSS_ORGANIZATION", "CROSS_ORGANIZATION", metadata);
    }
    return new MonitorOperationError(
      "FOREIGN_KEY_VIOLATION",
      "The request could not be saved.",
      metadata,
    );
  }
  if (error.code === "23514" || error.code === "23502") {
    return new MonitorOperationError(
      "CONSTRAINT_VIOLATION",
      "The request could not be saved.",
      metadata,
    );
  }
  return new MonitorOperationError(
    "PERSISTENCE_FAILED",
    "The request could not be saved.",
    metadata,
  );
}

export function isMonitorOperationError(
  error: unknown,
): error is MonitorOperationError {
  return error instanceof MonitorOperationError;
}
