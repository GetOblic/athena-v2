/**
 * Bounded diagnostic text for Monitor jobs.
 * Drops executable and document payloads. Does not store HTML.
 */

import {
  MONITOR_MAX_DIAGNOSTIC_MESSAGE,
  MONITOR_MAX_DIAGNOSTIC_METADATA_CHARS,
} from "@/services/monitor/monitorRuntime";

const FORBIDDEN_METADATA_KEYS = new Set([
  "html",
  "rawHtml",
  "imageBinary",
  "imageBytes",
  "script",
  "code",
  "executable",
]);

const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export type BoundedMonitorDiagnostic = {
  errorCode: string | null;
  errorMessage: string | null;
  errorMetadata: Record<string, unknown> | null;
};

function sanitize(value: unknown, depth: number): unknown {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 300);
    if (/<[a-z!/]/i.test(text) && /<\/?[a-z][\s\S]*>/i.test(text)) return null;
    return text;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value).slice(0, 20)) {
      if (FORBIDDEN_METADATA_KEYS.has(key)) continue;
      if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) continue;
      output[key] = sanitize(child, depth + 1);
    }
    return output;
  }
  return null;
}

export function boundMonitorDiagnostic(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  errorMetadata?: Record<string, unknown> | null;
}): BoundedMonitorDiagnostic {
  const errorCode =
    typeof input.errorCode === "string" && ERROR_CODE.test(input.errorCode)
      ? input.errorCode
      : null;
  const errorMessage =
    typeof input.errorMessage === "string" && input.errorMessage.trim()
      ? input.errorMessage.trim().slice(0, MONITOR_MAX_DIAGNOSTIC_MESSAGE)
      : null;
  if (!input.errorMetadata) {
    return { errorCode, errorMessage, errorMetadata: null };
  }
  const sanitized = sanitize(input.errorMetadata, 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return { errorCode, errorMessage, errorMetadata: null };
  }
  let metadata = sanitized as Record<string, unknown>;
  if (JSON.stringify(metadata).length > MONITOR_MAX_DIAGNOSTIC_METADATA_CHARS) {
    metadata = { truncated: true };
  }
  return { errorCode, errorMessage, errorMetadata: metadata };
}
