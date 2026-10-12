import {
  COMMUNITY_DISCOVERY_EVIDENCE_SNIPPET_MAX_LENGTH,
  COMMUNITY_DISCOVERY_EVIDENCE_TITLE_MAX_LENGTH,
  PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH,
} from "@/services/communityDiscovery/communityDiscoveryLimits";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;

function collapsePublicText(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function codePoints(input: string, maxLength: number): string {
  return Array.from(input).slice(0, maxLength).join("").trim();
}

/** Public catalog name. Null when the title cannot satisfy the catalog check. */
export function sanitizePublicCommunityDisplayName(input: string): string | null {
  const collapsed = collapsePublicText(input);
  if (!collapsed) return null;
  const bounded = codePoints(collapsed, PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH);
  if (!bounded || CONTROL_CHARACTER.test(bounded)) return null;
  return bounded;
}

export function boundCommunityEvidenceText(
  input: string,
  maxLength: number,
): string {
  const collapsed = collapsePublicText(input);
  if (!collapsed) return "";
  const bounded = codePoints(collapsed, maxLength);
  return CONTROL_CHARACTER.test(bounded) ? "" : bounded;
}

export function boundCommunityEvidenceTitle(input: string): string {
  return boundCommunityEvidenceText(
    input,
    COMMUNITY_DISCOVERY_EVIDENCE_TITLE_MAX_LENGTH,
  );
}

export function boundCommunityEvidenceSnippet(input: string): string {
  return boundCommunityEvidenceText(
    input,
    COMMUNITY_DISCOVERY_EVIDENCE_SNIPPET_MAX_LENGTH,
  );
}
