/**
 * Marker that distinguishes a Persona Intelligence compatibility bridge
 * from a genuine market Discussion or Prospect bridge.
 *
 * Marker: discussions.platform === "persona_intelligence"
 * (also mirrored in discussions.raw_json.intelligence_source = "persona")
 */

export const PERSONA_INTELLIGENCE_PLATFORM = "persona_intelligence";

export function isPersonaIntelligenceBridge(
  discussion:
    | {
        platform?: string | null;
        raw_json?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): boolean {
  if (!discussion) return false;
  if (discussion.platform === PERSONA_INTELLIGENCE_PLATFORM) return true;
  return discussion.raw_json?.intelligence_source === "persona";
}

export function excludePersonaIntelligenceBridges<
  T extends {
    platform?: string | null;
    raw_json?: Record<string, unknown> | null;
  },
>(discussions: T[]): T[] {
  return discussions.filter(
    (discussion) => !isPersonaIntelligenceBridge(discussion),
  );
}

/** Trusted Persona bridge: platform + matching persona_id marker. */
export function isTrustedPersonaBridgeFor(
  discussion:
    | {
        platform?: string | null;
        organization_id?: string | null;
        raw_json?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  personaId: string,
  organizationId: string,
): boolean {
  if (!discussion) return false;
  if (discussion.organization_id && discussion.organization_id !== organizationId) {
    return false;
  }
  if (discussion.platform !== PERSONA_INTELLIGENCE_PLATFORM) return false;
  if (discussion.raw_json?.intelligence_source !== "persona") return false;
  return discussion.raw_json?.persona_id === personaId;
}
