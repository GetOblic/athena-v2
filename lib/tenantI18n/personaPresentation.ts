/**
 * Presentation-only Persona status/lifecycle labels.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { PersonaLifecycleStatus } from "@/services/personas/personaLifecycle";
import { isPersonaLifecycleStatus } from "@/services/personas/personaLifecycle";
import type { PersonaDisplayReadiness } from "@/services/personas/personaDisplay";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const LIFECYCLE_KEYS = {
  New: "new",
  Reviewing: "reviewing",
  Researching: "researching",
  "In Use": "inUse",
  Validating: "validating",
  Refined: "refined",
  "Not a Fit": "notAFit",
  Archived: "archived",
} as const satisfies Record<
  PersonaLifecycleStatus,
  keyof TenantMessages["personas"]["lifecycle"]
>;

const READINESS_KEYS = {
  "Profile Created": "profileCreated",
  Queued: "queued",
  Processing: "processing",
  "Learning from Website": "learningFromWebsite",
  "Generating Executive Intelligence": "generatingExecutiveIntelligence",
  Ready: "ready",
  "Processing Failed": "processingFailed",
} as const;

type PersonaReadinessKey = keyof typeof READINESS_KEYS;

function lifecycleCopy(
  messages: TenantMessages,
  key: keyof TenantMessages["personas"]["lifecycle"],
): string {
  const localized = messages.personas.lifecycle[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.personas.lifecycle[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only Persona lifecycle label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedPersonaLifecycleLabel(
  messages: TenantMessages,
  status: string | null | undefined,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    return lifecycleCopy(messages, "new");
  }
  if (!isPersonaLifecycleStatus(trimmed)) {
    return trimmed;
  }
  return lifecycleCopy(messages, LIFECYCLE_KEYS[trimmed]);
}

/**
 * Presentation-only Persona readiness label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedPersonaReadinessLabel(
  messages: TenantMessages,
  status: string | null | undefined,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const key = READINESS_KEYS[trimmed as PersonaReadinessKey];
  if (!key) {
    return trimmed;
  }
  const localized = messages.personas.readiness[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.personas.readiness[key];
}

export function isPersonaReadinessToken(
  value: string | null | undefined,
): value is PersonaDisplayReadiness {
  return Boolean(value && value in READINESS_KEYS);
}
