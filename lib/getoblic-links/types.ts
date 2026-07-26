/**
 * Shared types for Athena ↔ GetOblic Links (Cloudflare Worker) integration.
 * Worker responses use `success`; Athena API routes expose `{ ok: true|false }`.
 */

export type GetOblicLinkTemplateId =
  | "business_created"
  | "ai_calendar"
  | "custom";

/** GET /health — no authentication. */
export type GetOblicWorkerHealth = {
  success: boolean;
  service?: string;
  status?: string;
  kv_binding?: string;
  timestamp?: string;
  error?: string;
};

/** Canonical Worker link record (GET /api/links/:slug → link). */
export type GetOblicWorkerLink = {
  schema_version?: number | string | null;
  slug: string;
  url: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  disabled: boolean;
  click_count: number | null;
  first_clicked_at?: string | null;
  last_clicked_at?: string | null;
  contact_id?: string | null;
  business_name?: string | null;
  campaign?: string | null;
  channel?: string | null;
  owner?: string | null;
  created_by?: string | null;
  notes?: string | null;
  short_url: string;
};

/**
 * Normalized Athena link view — Worker-canonical field names only.
 * Built from create / get / patch Worker responses.
 */
export type GetOblicLinkRecord = {
  slug: string;
  url: string;
  short_url: string;
  disabled: boolean;
  click_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  schema_version?: number | string | null;
  first_clicked_at?: string | null;
  last_clicked_at?: string | null;
  contact_id?: string | null;
  business_name?: string | null;
  campaign?: string | null;
  channel?: string | null;
  owner?: string | null;
  created_by?: string | null;
  notes?: string | null;
};

/** POST /api/links body — destination field is `url` only. */
export type GetOblicCreateLinkInput = {
  url: string;
  slug?: string;
  expires_at?: string | null;
  contact_id?: string;
  business_name?: string;
  campaign?: string;
  channel?: string;
  owner?: string;
  created_by?: string;
  notes?: string;
};

/** PATCH /api/links/:slug — uses `disabled`, never `enabled`. */
export type GetOblicUpdateLinkInput = {
  url?: string;
  expires_at?: string | null;
  disabled?: boolean;
  contact_id?: string | null;
  business_name?: string | null;
  campaign?: string | null;
  channel?: string | null;
  owner?: string | null;
  created_by?: string | null;
  notes?: string | null;
};

export type GetOblicLinksApiError = {
  code: string;
  message: string;
};

export type GetOblicLinksApiSuccess<T extends Record<string, unknown> = Record<string, never>> =
  { ok: true } & T;

export type GetOblicLinksApiFailure = {
  ok: false;
  error: GetOblicLinksApiError;
};

export type GetOblicLinksApiResult<T extends Record<string, unknown> = Record<string, never>> =
  | GetOblicLinksApiSuccess<T>
  | GetOblicLinksApiFailure;

export type GetOblicLinkHistoryEntry = {
  slug: string;
  short_url: string;
  url: string;
  template: GetOblicLinkTemplateId;
  created_at: string;
  label?: string | null;
  /** Soft-deleted locally after Worker reports missing */
  missing?: boolean;
  disabled?: boolean;
  click_count?: number | null;
};

export type GetOblicWorkerClientErrorCode =
  | "CONFIG_MISSING"
  | "TIMEOUT"
  | "NETWORK"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "WORKER_ERROR"
  | "INVALID_RESPONSE"
  | "PAYLOAD_TOO_LARGE";

export class GetOblicWorkerError extends Error {
  readonly code: GetOblicWorkerClientErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: GetOblicWorkerClientErrorCode,
    message: string,
    status = 502,
    details?: unknown,
  ) {
    super(message);
    this.name = "GetOblicWorkerError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
