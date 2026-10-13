export type ProspectFunnelWorkerFailureCode =
  | "CONFIG_MISSING"
  | "TIMEOUT"
  | "NETWORK"
  | "CONFLICT"
  | "NOT_FOUND"
  | "WORKER_ERROR";

export class ProspectFunnelWorkerError extends Error {
  readonly code: ProspectFunnelWorkerFailureCode;

  constructor(code: ProspectFunnelWorkerFailureCode, message: string) {
    super(message);
    this.name = "ProspectFunnelWorkerError";
    this.code = code;
  }
}

export class ProspectFunnelShortLinkPersistenceError extends Error {
  readonly code = "PERSISTENCE";

  constructor() {
    super("Prospect Funnel short-link mapping could not be saved.");
    this.name = "ProspectFunnelShortLinkPersistenceError";
  }
}
