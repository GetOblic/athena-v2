/**
 * Pure Persona helpers (no DB imports).
 */

import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

export { normalizeWebsiteUrl };

/** First-class optional descriptive text columns on `personas`. */
export const PERSONA_DESCRIPTIVE_TEXT_FIELDS = [
  "persona_name",
  "short_description",
  "category",
  "gender_identity",
  "age_range",
  "birth_year_approx",
  "generation",
  "cultural_background",
  "country",
  "state",
  "city",
  "location_summary",
  "languages",
  "relationship_status",
  "household",
  "income_range",
  "purchasing_power",
  "education",
  "occupation",
  "seniority",
  "industry_context",
  "lifestyle",
  "interests",
  "digital_behavior",
  "brands_influences",
  "values_text",
  "aesthetic_preferences",
  "preferred_imagery",
  "goals",
  "needs",
  "pain_points",
  "fears",
  "motivations",
  "objections",
  "buying_triggers",
  "decision_criteria",
  "purchase_behavior",
  "typical_concerns",
  "communication_style",
  "preferred_channels",
  "reference_website",
  "notes",
  "additional_context",
  "ads_content",
] as const;

export type PersonaDescriptiveTextField =
  (typeof PERSONA_DESCRIPTIVE_TEXT_FIELDS)[number];

export const PERSONA_DISPLAY_SHORT_DESCRIPTION_MAX = 80;
export const PERSONA_DISPLAY_CONTEXT_LINE_MAX = 60;

export function normalizeOptionalText(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Soft Reference Website normalization (Prospect URL approach).
 * Valid → normalized URL. Non-empty invalid → null + retain original for raw_json.
 */
export function normalizePersonaReferenceWebsite(value?: string | null): {
  referenceWebsite: string | null;
  invalidReferenceWebsiteInput: string | null;
} {
  if (value == null) {
    return { referenceWebsite: null, invalidReferenceWebsiteInput: null };
  }
  const raw = String(value).trim();
  if (!raw) {
    return { referenceWebsite: null, invalidReferenceWebsiteInput: null };
  }
  const normalized = normalizeWebsiteUrl(raw);
  if (normalized) {
    return {
      referenceWebsite: normalized,
      invalidReferenceWebsiteInput: null,
    };
  }
  return {
    referenceWebsite: null,
    invalidReferenceWebsiteInput: raw,
  };
}

export function mergePersonaRawJson(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    Object.assign(base, patch);
  }
  return Object.keys(base).length > 0 ? base : null;
}

export function hasMeaningfulProfileJson(
  value: unknown,
): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value as Record<string, unknown>).length > 0;
}

/**
 * Anti-blank application rule: at least one supported descriptive field
 * (or usable profile_json / invalid Reference Website input) must contain content.
 */
export function hasMeaningfulPersonaContent(input: {
  [key: string]: unknown;
  profile_json?: unknown;
  raw_json?: unknown;
  invalid_reference_website_input?: string | null;
}): boolean {
  for (const field of PERSONA_DESCRIPTIVE_TEXT_FIELDS) {
    if (normalizeOptionalText(input[field] as string | null | undefined)) {
      return true;
    }
  }

  if (hasMeaningfulProfileJson(input.profile_json)) {
    return true;
  }

  const invalidDirect = normalizeOptionalText(
    input.invalid_reference_website_input,
  );
  if (invalidDirect) return true;

  const raw = input.raw_json;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const invalidFromRaw = normalizeOptionalText(
      (raw as Record<string, unknown>).invalid_reference_website_input as
        | string
        | null
        | undefined,
    );
    if (invalidFromRaw) return true;
  }

  return false;
}

function truncateForDisplay(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  if (maxLen <= 1) return "…";
  return `${value.slice(0, maxLen - 1).trimEnd()}…`;
}

function firstNonEmptyLine(value: string): string | null {
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function hostnameFromReferenceWebsite(
  referenceWebsite?: string | null,
): string | null {
  const normalized =
    normalizeWebsiteUrl(referenceWebsite) ??
    normalizeOptionalText(referenceWebsite);
  if (!normalized) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(normalized)
      ? normalized
      : `https://${normalized}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/**
 * Deterministic Persona display label. Not persisted.
 */
export function resolvePersonaDisplayLabel(persona: {
  persona_name?: string | null;
  short_description?: string | null;
  reference_website?: string | null;
  additional_context?: string | null;
}): string {
  const name = normalizeOptionalText(persona.persona_name);
  if (name) return name;

  const shortDescription = normalizeOptionalText(persona.short_description);
  if (shortDescription) {
    return truncateForDisplay(
      shortDescription,
      PERSONA_DISPLAY_SHORT_DESCRIPTION_MAX,
    );
  }

  const hostname = hostnameFromReferenceWebsite(persona.reference_website);
  if (hostname) return hostname;

  const context = normalizeOptionalText(persona.additional_context);
  if (context) {
    const firstLine = firstNonEmptyLine(context);
    if (firstLine) {
      return `Persona: ${truncateForDisplay(
        firstLine,
        PERSONA_DISPLAY_CONTEXT_LINE_MAX,
      )}`;
    }
  }

  return "Unnamed Persona";
}
