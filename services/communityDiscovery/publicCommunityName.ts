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
 * Phrases are removed even when they share a sentence with specific text.
 */
const FACEBOOK_DIRECTORY_BOILERPLATE = [
  String.raw`\blog\s*in(?:\s+to|\s+into|to)?(?:\s+or\s+sign\s+up)?(?:\s+(?:to|for)\s+facebook)?(?:\s+to\s+(?:start\s+)?shar(?:e|ing)(?:\s+and\s+connecting)?)?`,
  String.raw`\bsign\s+up(?:\s+for\s+facebook)?\b`,
  String.raw`\bcreate\s+(?:a\s+)?(?:new\s+)?account\b`,
  String.raw`\bit(?:'s| is)\s+quick\s+and\s+easy\b`,
  String.raw`\bit(?:'s| is)\s+free\s+and\s+always\s+will\s+be\b`,
  String.raw`\bforgot(?:\s+your)?\s+(?:account|password)\b`,
  String.raw`\bemail\s+or\s+phone\b`,
  String.raw`\bconnect\s+with\s+(?:your\s+)?friends\b`,
  String.raw`\bfriends,?\s*family,?\s+and\s+people\s+you\s+know\b`,
  String.raw`\bpeople\s+you\s+know\b`,
  String.raw`\bfacebook\s+helps\s+you\s+connect\b[^.|\n]*`,
  String.raw`\bfacebook\s+is\s+a\s+social\s+networking\b[^.|\n]*`,
  String.raw`\bsee\s+posts,?\s*photos\s+and\s+more(?:\s+on\s+facebook)?\b`,
  String.raw`\bjoin\s+facebook\b(?:\s+to\s+connect\b[^.|\n]*)?`,
  String.raw`\bdiscover\s+groups\b`,
  String.raw`\bpopular\s+groups\b`,
  String.raw`\bfind\s+communities\s+for\s+you\b`,
  String.raw`\bover\s+(?:\d+(?:[.,]\d+)?|one|two|three)\s+billion\s+people\b[^.|\n]*`,
  String.raw`\buse\s+facebook(?:\s+groups)?\s+to\s+(?:share|connect|find)\b[^.|\n]*`,
  String.raw`\bcommunities\s+of\s+people\s+who\s+share\b[^.|\n]*`,
  String.raw`\bpeople\s+who\s+share\s+(?:their|your)\s+interests\b[^.|\n]*`,
  String.raw`\bfacebook\s+groups?\s+are\s+(?:a\s+place|communities)\s+to\s+connect\b[^.|\n]*`,
  String.raw`\babout\s+this\s+group\b`,
  String.raw`\bview\s+(?:this\s+)?group\b`,
  String.raw`\bjoin\s+this\s+group\s+to\s+see\b[^.|\n]*`,
  String.raw`\bjoin\s+or\s+create\s+(?:a\s+)?group\b`,
  String.raw`\bfacebook\s+groups?\b`,
  String.raw`\b(?:public|private)\s+groups?\b`,
  String.raw`\b\d[\d,.]*(?:\s*[km])?\s+members?\b`,
  String.raw`\bon\s+facebook\b`,
];

const DIRECTORY_CHROME_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "of",
  "on",
  "in",
  "with",
  "your",
  "you",
  "it",
  "its",
  "is",
  "are",
  "be",
  "will",
  "always",
  "facebook",
  "log",
  "login",
  "sign",
  "signup",
  "up",
  "into",
  "account",
  "accounts",
  "password",
  "email",
  "phone",
  "friends",
  "friend",
  "family",
  "people",
  "know",
  "connect",
  "connecting",
  "share",
  "sharing",
  "start",
  "posts",
  "post",
  "photos",
  "photo",
  "more",
  "see",
  "view",
  "join",
  "create",
  "new",
  "free",
  "quick",
  "easy",
  "public",
  "private",
  "group",
  "groups",
  "member",
  "members",
  "about",
  "this",
  "page",
  "help",
  "helps",
  "social",
  "networking",
  "website",
  "service",
  "forgot",
  "welcome",
  "make",
  "makes",
  "life",
  "popular",
  "communities",
  "community",
  "billion",
  "interests",
  "interest",
  "over",
  "find",
]);

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
  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    for (const source of FACEBOOK_DIRECTORY_BOILERPLATE) {
      text = text.replace(new RegExp(source, "gi"), " ");
    }
    text = text.replace(/\s+/g, " ").trim();
    if (text === before) break;
  }
  return text;
}

function tidySegment(value: string): string {
  return value
    .replace(/^[\s|,:;.\-–—]+|[\s|,:;.\-–—]+$/g, "")
    .replace(/^(?:with|and|or|to|for|on|the|a|an)\b\s*/i, "")
    .trim();
}

function hasSpecificListingEvidence(text: string, displayName: string): boolean {
  let remainder = text;
  const name = displayName.trim();
  if (name.length >= 3) {
    remainder = remainder.replace(new RegExp(escapeRegExp(name), "gi"), " ");
  }
  const words = remainder
    .toLowerCase()
    .split(/[^0-9a-z\u00c0-\u024f]+/)
    .filter((word) => word.length >= 4);
  return words.some((word) => !DIRECTORY_CHROME_WORDS.has(word));
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
  const specific = listingSegments(bounded)
    .map((segment) => tidySegment(withoutDirectoryBoilerplate(segment)))
    .filter((segment) => hasSpecificListingEvidence(segment, displayName));
  return boundCommunityEvidenceSnippet(specific.join(". "));
}
