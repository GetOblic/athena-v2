/**
 * Marker that distinguishes a Prospect Intelligence compatibility bridge
 * from a genuine market Discussion.
 *
 * Marker: discussions.platform === "prospect_intelligence"
 * (also mirrored in discussions.raw_json.intelligence_source = "prospect")
 */

export const PROSPECT_INTELLIGENCE_PLATFORM = "prospect_intelligence";

export function isProspectIntelligenceBridge(
  discussion:
    | {
        platform?: string | null;
        raw_json?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): boolean {
  if (!discussion) return false;
  if (discussion.platform === PROSPECT_INTELLIGENCE_PLATFORM) return true;
  return discussion.raw_json?.intelligence_source === "prospect";
}

export function excludeProspectIntelligenceBridges<
  T extends {
    platform?: string | null;
    raw_json?: Record<string, unknown> | null;
  },
>(discussions: T[]): T[] {
  return discussions.filter(
    (discussion) => !isProspectIntelligenceBridge(discussion),
  );
}
