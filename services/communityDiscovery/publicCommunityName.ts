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

/** Trailing Brave/Facebook chrome. The separator stays required so a name containing Facebook is kept. */
const FACEBOOK_GROUP_TITLE_SUFFIX =
  /\s*[|\-–—·•]\s*facebook(?:\.com)?(?:\s+groups)?\s*$/i;

const FACEBOOK_DIRECTORY_NAME_WORDS = new Set([
  "facebook",
  "facebook.com",
  "group",
  "groups",
  "popular",
]);

/**
 * Question-shaped titles and obvious individual post openers.
 * "How to …" group names do not match these patterns.
 */
const FACEBOOK_POST_HEADLINE_PATTERNS = [
  /^(?:has|have|does|do|did|is|are|can|could|would|should|will)\s+(?:anyone|anybody|someone|somebody)\b/i,
  /^(?:anyone|anybody)\s+(?:else|know|have|has|tried|used|got|here|recommend)\b/i,
  /^(?:looking for)\b/i,
  /^(?:hey|hi|hello)\s+(?:everyone|all|guys|friends|there)\b/i,
  /^(?:i(?:'m| am)|i(?:'ve| have)|i need|i want|i just|just wanted|just wondering)\b/i,
  /^(?:what|why|how|when|where|who|which)\s+(?:do|does|did|can|could|should|would|is|are|was|were|will)\b/i,
];

function isGenericFacebookDirectoryName(name: string): boolean {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((word) => word.length > 0 && word !== ".");
  return (
    words.length > 0 &&
    words.every((word) => FACEBOOK_DIRECTORY_NAME_WORDS.has(word))
  );
}

function isObviousFacebookPostHeadline(name: string): boolean {
  if (name.includes("?") || name.includes("？")) return true;
  return FACEBOOK_POST_HEADLINE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Group name accepted for a new Facebook catalog row.
 * Strips a standard Facebook suffix, then rejects directory chrome and post headlines.
 * Returns null instead of inventing a name from the numeric id or vanity slug.
 */
export function facebookGroupDisplayNameFromTitle(
  input: string,
  canonicalIdentity: string,
): string | null {
  const sanitized = sanitizePublicCommunityDisplayName(input);
  if (!sanitized || isGenericFacebookDirectoryName(sanitized)) return null;

  let name = sanitized;
  for (let pass = 0; pass < 3; pass += 1) {
    const stripped = name.replace(FACEBOOK_GROUP_TITLE_SUFFIX, "").trim();
    if (stripped === name) break;
    const cleaned = sanitizePublicCommunityDisplayName(stripped);
    if (!cleaned) return null;
    name = cleaned;
  }

  if (!name || isGenericFacebookDirectoryName(name)) return null;
  if (isObviousFacebookPostHeadline(name)) return null;
  if (name.toLowerCase() === canonicalIdentity.toLowerCase()) return null;
  return name;
}

/**
 * Stored Facebook catalog name that a group-root title would accept unchanged.
 * A post headline, directory label, or raw group id is not reliable.
 */
export function isReliableFacebookGroupCatalogName(
  displayName: string,
  canonicalIdentity: string,
): boolean {
  return (
    facebookGroupDisplayNameFromTitle(displayName, canonicalIdentity) ===
    displayName
  );
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
  String.raw`\bsee\s+all\b`,
  String.raw`\bsuggested\s+for\s+you\b`,
  String.raw`\byour\s+groups\b`,
  String.raw`\bgroups\s+you(?:'ve|\s+have)\s+joined\b`,
];

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Facebook directory category labels. A segment that is only one of these,
 * or a run of three or more, is navigation rather than a group description.
 */
const FACEBOOK_DIRECTORY_CATEGORY_LABELS = [
  "categories",
  "science & tech",
  "science and tech",
  "sports & fitness",
  "sports and fitness",
  "buy & sell",
  "buy and sell",
  "food & drink",
  "food and drink",
  "health & wellness",
  "health and wellness",
  "hobbies & crafts",
  "home & garden",
  "learning & education",
  "arts & culture",
  "business & industry",
  "family & relationships",
  "humor & fun",
  "vehicles & commutes",
  "entertainment",
  "travel",
  "animals",
  "parenting",
  "education",
] as const;

const FACEBOOK_DIRECTORY_CATEGORY_SET = new Set<string>(FACEBOOK_DIRECTORY_CATEGORY_LABELS);

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return htmlCodePoint(code) ?? entity;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return htmlCodePoint(code) ?? entity;
    }
    return NAMED_HTML_ENTITIES[key] ?? entity;
  });
}

function htmlCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 32 || code === 127 || code > 0x10ffff) {
    return " ";
  }
  return String.fromCodePoint(code);
}

function normalizeCategoryLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.|·•,;:-]+|[\s.|·•,;:-]+$/g, "")
    .trim();
}

function isDirectoryCategoryLabel(value: string): boolean {
  return FACEBOOK_DIRECTORY_CATEGORY_SET.has(normalizeCategoryLabel(value));
}

function stripDirectoryCategorySequence(segment: string): string {
  const labels = [...FACEBOOK_DIRECTORY_CATEGORY_LABELS].sort(
    (left, right) => right.length - left.length,
  );
  const labelPattern = labels.map((label) => escapeRegExp(label)).join("|");
  const sequence = new RegExp(
    String.raw`(?:^|[\s.|·•,;:-])(?:${labelPattern})(?:[\s.|·•,;:-]+(?:${labelPattern})){2,}`,
    "gi",
  );
  return segment.replace(sequence, " ");
}

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

function facebookGroupListingSegments(
  input: string,
  displayName: string,
  omitPostBodies: boolean,
): string[] {
  const decoded = decodeHtmlEntities(input);
  const source = omitPostBodies ? decoded.replace(/[?？]+/g, ". ") : decoded;
  const bounded = boundCommunityEvidenceSnippet(source);
  if (!bounded) return [];
  return listingSegments(bounded)
    .map((segment) =>
      tidySegment(
        withoutDirectoryBoilerplate(stripDirectoryCategorySequence(segment)),
      ),
    )
    .filter((segment) => !isDirectoryCategoryLabel(segment))
    .filter((segment) => hasSpecificListingEvidence(segment, displayName))
    .filter((segment) =>
      omitPostBodies ? !isObviousFacebookPostHeadline(segment) : true,
    );
}

/**
 * Keep listing text that describes this group.
 * Generic Facebook directory copy is removed before qualification and display.
 */
export function specificFacebookGroupEvidenceSnippet(
  input: string,
  displayName: string,
): string {
  return boundCommunityEvidenceSnippet(
    facebookGroupListingSegments(input, displayName, false).join(". "),
  );
}

/**
 * Group-root listing text with directory chrome and individual post bodies removed.
 * A question or post opener is not group-level evidence, even on the group URL.
 */
export function facebookGroupRootEvidenceSnippet(
  input: string,
  displayName: string,
): string {
  return boundCommunityEvidenceSnippet(
    facebookGroupListingSegments(input, displayName, true).join(". "),
  );
}
