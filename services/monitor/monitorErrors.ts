/**
 * Monitor operation failures.
 * Codes are stable for the future worker and for tests.
 * This module does not read a plan, a database, or a network.
 */

export class MonitorOperationError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "MonitorOperationError";
    this.code = code;
  }
}

export function isMonitorOperationError(
  error: unknown,
): error is MonitorOperationError {
  return error instanceof MonitorOperationError;
}
