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

/**
 * Facebook directory chrome that does not describe the discovered group.
 * A segment is dropped only when nothing specific remains after these phrases.
 */
const FACEBOOK_DIRECTORY_BOILERPLATE = [
  String.raw`\blog\s*in(?:to)?(?:\s+or\s+sign\s+up)?(?:\s+(?:to|for)\s+facebook)?(?:\s+to\s+start\s+sharing(?:\s+and\s+connecting)?)?`,
  String.raw`\bsign\s+up\s+for\s+facebook\b`,
  String.raw`\bconnect\s+with\s+(?:your\s+)?friends,\s*family\s+and\s+people\s+you\s+know\b`,
  String.raw`\bfriends,\s*family\s+and\s+people\s+you\s+know\b`,
  String.raw`\bfacebook\s+is\s+a\s+social\s+networking\b(?:\s+\w+){0,14}`,
  String.raw`\bsee\s+posts,\s*photos\s+and\s+more(?:\s+on\s+facebook)?\b`,
  String.raw`\bcreate\s+(?:a\s+)?new\s+account\b`,
  String.raw`\bforgot(?:\s+your)?\s+account\b`,
  String.raw`\bjoin\s+facebook\s+to\s+connect\b(?:\s+\w+){0,12}`,
  String.raw`\bdiscover\s+groups\b`,
  String.raw`\bfacebook\s+groups\s+are\s+(?:a\s+place|communities)\s+to\s+connect\b(?:\s+\w+){0,16}`,
  String.raw`\bfacebook\s+groups?\b`,
  String.raw`\bjoin\s+or\s+create\s+a\s+group\b`,
  String.raw`\bjoin\s+this\s+group\s+to\s+see\b(?:\s+\w+){0,10}`,
  String.raw`\bpublic\s+group\b`,
  String.raw`\bprivate\s+group\b`,
  String.raw`\b\d[\d,.]*(?:\s*[km])?\s+members?\b`,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listingSegments(snippet: string): string[] {
  return snippet
    .split(/[\n|·•]+|\.\s+/)
    .map((segment) => segment.replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, "").trim())
    .filter((segment) => segment.length > 0);
}

function withoutDirectoryBoilerplate(segment: string): string {
  let text = segment;
  for (const source of FACEBOOK_DIRECTORY_BOILERPLATE) {
    text = text.replace(new RegExp(source, "gi"), " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function hasSpecificListingEvidence(text: string, displayName: string): boolean {
  let remainder = text;
  const name = displayName.trim();
  if (name.length >= 3) {
    remainder = remainder.replace(new RegExp(escapeRegExp(name), "gi"), " ");
  }
  remainder = remainder.replace(/\bfacebook\b/gi, " ");
  const letters = remainder.replace(/[^0-9A-Za-z\u00C0-\u024F]+/g, "");
  return letters.length >= 12;
}

/**
 * Keep listing text that describes this group.
 * Generic Facebook directory copy is removed before qualification and display.
 */
export function specificFacebookGroupEvidenceSnippet(
  input: string,
  displayName: string,
): string {
  const bounded = boundCommunityEvidenceSnippet(input);
  if (!bounded) return "";
  const specific = listingSegments(bounded).filter((segment) =>
    hasSpecificListingEvidence(withoutDirectoryBoilerplate(segment), displayName),
  );
  return boundCommunityEvidenceSnippet(specific.join(". "));
}
