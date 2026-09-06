import type {
  GetOblicGoogleIdClassification,
  GetOblicGoogleIdKind,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";

const LEGACY_HEX_GOOGLE_ID = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;
const CHIJ_PLACE_ID = /^ChIJ[A-Za-z0-9_-]+$/;
const NUMERIC_ONLY = /^\d+$/;
const MANUAL_ENTRY_SENTINEL = /^manual_entry$/i;
const HTTP_URL = /^https?:\/\//i;

/**
 * Conservative classifier for WordPress `_google_id`.
 * Matchable only for proven live shapes: legacy 0x…:0x… and ChIJ… Place IDs.
 * Does not normalize unknown identities or call Google.
 */
export function classifyGetOblicGoogleId(
  rawValue: string | null | undefined,
): GetOblicGoogleIdClassification {
  if (rawValue == null) {
    return { raw: rawValue ?? null, isMatchable: false, kind: "blank" };
  }

  const raw = String(rawValue);
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, isMatchable: false, kind: "blank" };
  }

  if (MANUAL_ENTRY_SENTINEL.test(trimmed)) {
    return { raw, isMatchable: false, kind: "sentinel" };
  }

  if (LEGACY_HEX_GOOGLE_ID.test(trimmed)) {
    return { raw, isMatchable: true, kind: "legacy_hex" };
  }

  if (CHIJ_PLACE_ID.test(trimmed)) {
    return { raw, isMatchable: true, kind: "chij" };
  }

  if (NUMERIC_ONLY.test(trimmed)) {
    return { raw, isMatchable: false, kind: "numeric" };
  }

  if (looksLikeUrl(trimmed)) {
    return { raw, isMatchable: false, kind: "url" };
  }

  return { raw, isMatchable: false, kind: "unknown" };
}

export function isMatchableGetOblicGoogleIdKind(
  kind: GetOblicGoogleIdKind,
): boolean {
  return kind === "legacy_hex" || kind === "chij";
}

function looksLikeUrl(value: string): boolean {
  if (HTTP_URL.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
