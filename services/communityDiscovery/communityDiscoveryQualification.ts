import {
  callOpenRouterBounded,
  OpenRouterBoundedCallError,
  type OpenRouterBoundedMessage,
} from "@/lib/openrouter";
import {
  boundCommunityDiscoveryBusinessContext,
  communityBusinessContextHasFacts,
  COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK,
} from "@/services/communityDiscovery/communityDiscoveryBusinessContext";
import { resolveCommunityQualificationModel } from "@/services/communityDiscovery/communityQualificationModel";
import {
  COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH,
  COMMUNITY_DISCOVERY_EXPLANATION_MIN_LENGTH,
  COMMUNITY_DISCOVERY_GUIDANCE_MAX_LENGTH,
  COMMUNITY_DISCOVERY_GUIDANCE_MIN_LENGTH,
  COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS,
  COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH,
  COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH,
} from "@/services/communityDiscovery/communityDiscoveryLimits";

export type CommunityQualificationCandidate = {
  canonicalIdentity: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
};

export type CommunityQualificationReason =
  | "timeout"
  | "error"
  | "unconfigured"
  | "invalid_response";

/** Closed diagnostic codes. Logs may include these names, counts, finish_reason, and token usage only. */
export const COMMUNITY_QUALIFICATION_DIAGNOSTIC_CODES = [
  "model_timeout",
  "configuration",
  "transport",
  "empty_response",
  "malformed_json",
  "truncated_response",
  "schema_failure",
  "identity_mismatch",
  "duplicate_identity",
  "explanation_rejected",
  "contribution_rejected",
  "speaker_role_rejected",
] as const;

export type CommunityQualificationDiagnosticCode =
  (typeof COMMUNITY_QUALIFICATION_DIAGNOSTIC_CODES)[number];

const DIAGNOSTIC_CODE_SET = new Set<string>(COMMUNITY_QUALIFICATION_DIAGNOSTIC_CODES);

export type CommunityQualificationCompletion = {
  content: string;
  finishReason?: string | null;
  completionTokens?: number | null;
};

export type CommunityQualificationOutcome =
  | {
      status: "available";
      explanations: ReadonlyMap<string, string>;
      /** Ready-to-paste messages keyed by canonical identity. */
      suggestions: ReadonlyMap<string, string>;
      engagementGuidance?: ReadonlyMap<string, string>;
      readyToPasteUnavailable?: ReadonlySet<string>;
    }
  | {
      status: "unavailable";
      reason: CommunityQualificationReason;
    };

export type CommunityQualificationComplete = (input: {
  messages: readonly OpenRouterBoundedMessage[];
  maxTokens: number;
  signal: AbortSignal;
}) => Promise<string | CommunityQualificationCompletion>;

const SENSITIVE_PATTERNS = [
  String.raw`\b\d[\d,.]*(?:\s*[km])?\s+members?\b`,
  String.raw`\bmember counts?\b`,
  String.raw`\b(?:very |highly |extremely )?(?:active|inactive)\b`,
  String.raw`\bposts? (?:daily|weekly|hourly|often|regularly)\b`,
  String.raw`\blast active\b`,
  String.raw`\brules?\b`,
  String.raw`\bcommunity guidelines\b`,
  String.raw`\bverified access\b`,
  String.raw`\bjoined the group\b`,
  String.raw`\bcan access\b`,
  String.raw`\bprivate (?:posts|content)\b`,
  String.raw`\bgraph api\b`,
];

/**
 * Factual claims about a group's activity, membership, access, or rules.
 * Bare words such as "active", "rules", or "post regularly" are not enough.
 */
const EXPLANATION_UNSUPPORTED_ASSERTION_PATTERNS = [
  String.raw`\b\d[\d,.]*(?:\s*[km])?\s+members?\b`,
  String.raw`\bmember counts?\b`,
  String.raw`\b(?:this|the|that)\s+(?:group|community)\s+(?:is\s+)?(?:very\s+|highly\s+|extremely\s+)?(?:active|inactive)\b`,
  String.raw`\b(?:very|highly|extremely)\s+active\s+(?:group|community)\b`,
  String.raw`\b(?:this|the|that)\s+(?:group|community)\s+posts?\s+(?:daily|weekly|hourly|often|regularly)\b`,
  String.raw`\b(?:group|community|members)\s+post(?:s|ing)?\s+regularly\b`,
  String.raw`\bposts?\s+(?:daily|weekly|hourly)\b`,
  String.raw`\blast active\b`,
  String.raw`\b(?:this|the|that)\s+group(?:'s)?\s+rules?\b`,
  String.raw`\bgroup rules?\b`,
  String.raw`\bcommunity guidelines\b`,
  String.raw`\b(?:has|have|requires?|enforces?)\s+(?:strict\s+)?rules\b`,
  String.raw`\bverified access\b`,
  String.raw`\bjoined the group\b`,
  String.raw`\bcan access\b`,
  String.raw`\bprivate (?:posts|content)\b`,
  String.raw`\bgraph api\b`,
  String.raw`\brelevance\s+score\b`,
  String.raw`\b\d+\s*(?:\/\s*10|out of\s+10)\b`,
];

const UNSUPPORTED_GROUP_ASSERTION_PATTERNS = [
  String.raw`\b(?:members|people|someone)\s+(?:discussed|were discussing|posted)\b`,
  String.raw`\b(?:recent|previous|latest)\s+(?:post|thread|discussion|comment)s?\b`,
  String.raw`\bI\s+(?:saw|read|noticed)\s+(?:a\s+|the\s+)?(?:post|thread|comment|discussion)\b`,
  String.raw`\b(?:the|this)\s+group(?:'s)?\s+(?:rules|admins|moderators)\b`,
  String.raw`\b(?:I|we)\s+(?:joined|am a member|are members)\b`,
  String.raw`\bgroup rules\b`,
  String.raw`\bcommunity guidelines\b`,
];

const QUALITY_AND_GUARANTEE_PATTERNS = [
  String.raw`\b(?:award[- ]winning|certified|licensed|insured)\b`,
  String.raw`\b\d+\+?\s+years?\s+(?:of\s+)?(?:experience|in\s+business)\b`,
  String.raw`\b(?:guaranteed|guarantee|risk[- ]free|money[- ]back)\b`,
  String.raw`\bproven\s+results\b`,
  String.raw`\b(?:best[- ]in[- ]class|top[- ]rated|highest[- ]quality|five[- ]star|5[- ]star)\b`,
  String.raw`\b(?:we are|we're|i am|i'm)\s+the\s+best\b`,
  String.raw`\b(?:family|locally|woman|veteran)[- ]owned\b`,
];

const SERVICE_CLAIM_PATTERN =
  /\b(?:we|i)\s+(?:sell|offer|provide|build|specialize(?:\s+in)?|make)\s+(?!sure\b)([^.]{0,120})/gi;

const POSSESSIVE_BUSINESS_PATTERN =
  /\b(?:our|my)\s+(company|business|product|service|brand|team|credentials)\b/gi;

const LOCATION_CLAIM_PATTERN =
  /\b(?:based|located|serving)\s+in\s+([^.,;:]{2,48})/gi;

const CLAIM_STOP_WORDS = new Set([
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
  "your",
  "their",
  "them",
  "they",
  "have",
  "been",
  "into",
  "onto",
  "over",
  "under",
  "about",
  "before",
  "after",
  "when",
  "what",
  "which",
  "where",
  "will",
  "would",
  "could",
  "should",
  "than",
  "then",
  "also",
  "just",
  "only",
  "some",
  "more",
  "most",
  "such",
  "each",
  "other",
  "another",
  "here",
  "there",
]);

const POSTER_POSSESSION_PATTERNS = [String.raw`\bmy\s+(?:home|house)\b`];

const POSTER_ROLE_PATTERNS = [
  String.raw`\b(?:i am|i'm|we are|we're)\s+(?:a|an)\s+(homeowner|home owner|customer|client|buyer|member|resident|business owner)\b`,
  String.raw`\bas an?\s+(homeowner|home owner|customer|client|buyer|member|resident|business owner)\b`,
];

const BUYER_POSTER_ROLES = [
  "homeowner",
  "home owner",
  "customer",
  "client",
  "buyer",
  "resident",
] as const;

/**
 * Requests for a service, agency, or provider. Group discovery ("looking for
 * groups") is not a request to hire. The noun must end the word, so
 * "company-wide" is not "company".
 */
const SEEKER_SERVICE_OBJECT =
  String.raw`(?:services?|agency|agencies|provider|providers|contractor|contractors|company|companies)(?=$|[^\w-])`;

const SEEKER_STYLE_PATTERNS = [
  String.raw`\b(?:i am|i'm|we are|we're)\s+looking\s+for\s+(?:a|an|some|any)?\s*(?:[a-z0-9-]+\s+){0,4}${SEEKER_SERVICE_OBJECT}`,
  String.raw`\b(?:can|could|would)\s+(?:anyone|somebody|someone)\s+recommend\s+(?:me\s+)?(?:a|an)\s+(?:good\s+|reliable\s+)?(?:[a-z0-9-]+\s+){0,3}${SEEKER_SERVICE_OBJECT}`,
  String.raw`\b(?:i|we)\s+need\s+help\s+finding\s+(?:a|an|some|any)?\s*(?:good\s+|reliable\s+)?(?:[a-z0-9-]+\s+){0,3}${SEEKER_SERVICE_OBJECT}`,
  String.raw`\b(?:does|do)\s+anyone\s+know\s+(?:of\s+)?(?:a|an)\s+(?:good\s+|reliable\s+)?(?:[a-z0-9-]+\s+){0,3}${SEEKER_SERVICE_OBJECT}`,
];

const ORGANIZATION_ROLE_EXCLUDED_LABELS =
  /^(?:primary audience|communication style|geographic reach):/i;

const IMPERATIVE_GUIDANCE_PATTERNS = [
  String.raw`^(?:please\s+)?(?:post|publish|paste|draft)\b`,
  String.raw`\b(?:post|publish|paste|draft|write)\s+(?:a|an|the|your)\s+(?:request|question|message|comment|post|note|update)\b`,
  String.raw`\bask\s+(?:the\s+)?(?:group|members|them|people)\b`,
  String.raw`\b(?:you|the user)\s+(?:could|should|might|can|may)\s+(?:post|ask|share|write)\b`,
  String.raw`\bmay\s+want\s+to\s+(?:share|post|ask|write)\b`,
  String.raw`\bconsider\s+(?:posting|asking|sharing|writing)\b`,
  String.raw`\brequest\s+for\s+recommendations\b`,
  String.raw`\b(?:publiez|postez|rédigez|redigez)\s+(?:une|un|la|le|votre)\s+(?:demande|message|question|commentaire)\b`,
  String.raw`\bdemande\s+de\s+recommandations\b`,
  String.raw`\b(?:publica|publique|escribe|redacta)\s+(?:una|un|la|el|tu)\s+(?:solicitud|petición|peticion|mensaje|pregunta)\b`,
  String.raw`\bsolicitud\s+de\s+recomendaciones\b`,
  String.raw`\b(?:poste|veröffentliche|veroeffentliche|schreibe)\s+(?:eine|einen|die|den)\s+(?:anfrage|beitrag|nachricht|frage)\b`,
  String.raw`\banfrage\s+nach\s+empfehlungen\b`,
  String.raw`\b(?:pubblica|scrivi)\s+(?:una|un)\s+(?:richiesta|messaggio|domanda)\b`,
  String.raw`\brichiesta\s+di\s+raccomandazioni\b`,
  String.raw`\b(?:publique|escreva)\s+(?:um|uma|o|a)\s+(?:pedido|mensagem|pergunta)\b`,
  String.raw`\bpedido\s+de\s+recomenda(?:ções|coes)\b`,
];

export const COMMUNITY_QUALIFICATION_SYSTEM_PROMPT = [
  "You explain whether each public community search result is relevant to the user's objective.",
  "Use only the objective, the business context, the result title, the result snippet, and the result URL.",
  "Business context is private to this request. It is not a fact about any group.",
  "Do not invent group activity, member counts, rules, descriptions, discussions, membership, or access.",
  "Do not claim the community was opened, joined, or verified.",
  "Do not invent credentials, quality claims, guarantees, or business attributes absent from the objective and business context.",
  "The author of readyToPasteMessage is the organization represented by Athena Brain, contributing to the discovered community.",
  "When business context contains a usable fact, write from that organization's verified services, expertise, or positioning.",
  "Do not write or imply that the author is a buyer, homeowner, customer, member, or business owner unless the objective explicitly establishes that role and it is compatible with the business context.",
  "When the organization provides a service, do not request that service or ask anyone to recommend an agency or provider.",
  "A question may invite discussion or share expertise without presenting the organization as a customer.",
  "Primary audience is who the business serves, not the poster's role.",
  "If the title and snippet do not establish relevance, say that they do not show a clear connection to the objective.",
  "When audienceEvidence is present, it comes only from that result's title and snippet.",
  "If audienceEvidence conflicts with the objective or the primary audience, explain that mismatch honestly and still return the result.",
  "When a result title names a distinct specialty, such as affiliate SEO when the objective is local SEO or GEO, relevanceExplanation must say that those specialties differ.",
  "A shared word is not enough to treat those specialties as the same. Still return the result.",
  "If audienceEvidence is absent, do not assign an audience.",
  "Never invent a relevance score or a member count.",
  "Write relevanceExplanation as one concise sentence.",
  "Write relevanceExplanation, engagementGuidance, and readyToPasteMessage in the same language as the objective.",
  "Do not claim the group is active, posts on a schedule, has rules, or grants access unless that result's title or snippet states it.",
  "engagementGuidance is optional. Include it only when it adds useful advice. Write at most one short sentence, or an empty string. It is not the post.",
  "readyToPasteMessage is the exact text the user could paste into the community.",
  "Write readyToPasteMessage as a complete natural-language post of at most two sentences, grounded in the objective, the business context, and that result's title, snippet, and URL.",
  "When business context contains a usable fact, readyToPasteMessage must include one concrete fact or positioning detail from that context.",
  "Do not write a readyToPasteMessage that only repeats the objective when a usable fact is available.",
  "Do not treat generic words such as business, local, or services as that fact.",
  "A paraphrase may restate a fact already written in the business context. Do not invent credentials, services, or guarantees.",
  "If a supported fact cannot be included, return an empty readyToPasteMessage.",
  "When communication style is present, follow it. Do not invent a style.",
  "Do not write readyToPasteMessage as an instruction such as 'Post a request for recommendations'.",
  "Do not invent group rules, member activity, discussion content, or claims about the user's business.",
  "If you cannot ground a field, use an empty string.",
  'Return JSON only: {"results":[{"canonicalIdentity":"string","canonicalUrl":"string","relevanceExplanation":"string","engagementGuidance":"string","readyToPasteMessage":"string"}]}',
].join("\n");

async function defaultComplete(
  input: Parameters<CommunityQualificationComplete>[0],
): Promise<CommunityQualificationCompletion> {
  const model = resolveCommunityQualificationModel();
  if (model.status !== "configured") {
    return Promise.reject(new OpenRouterBoundedCallError("unconfigured"));
  }
  const completion = await callOpenRouterBounded({
    messages: input.messages,
    maxTokens: input.maxTokens,
    temperature: 0,
    signal: input.signal,
    model: model.model,
  });
  return {
    content: completion.content,
    finishReason: completion.finishReason,
    completionTokens: completion.completionTokens,
  };
}

function extractJsonObject(content: string): unknown | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

export function explanationFromQualification(
  explanation: unknown,
  evidence: string,
  source?: { objective: string; title: string },
): string | null {
  if (typeof explanation !== "string") return null;
  const collapsed = collapseQualificationText(explanation);
  if (
    collapsed.length < COMMUNITY_DISCOVERY_EXPLANATION_MIN_LENGTH ||
    collapsed.length > COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH
  ) {
    return null;
  }
  if (!explanationStaysWithinEvidence(collapsed, evidence)) return null;
  if (
    source &&
    !explanationAcknowledgesSpecialtyDistinction(
      collapsed,
      source.objective,
      source.title,
    )
  ) {
    return null;
  }
  return collapsed;
}

function normalizeForMatch(value: string): string {
  return value.replace(/[’‘]/g, "'");
}

function textStaysWithinEvidence(
  text: string,
  evidence: string,
  patterns: readonly string[],
): boolean {
  const haystack = normalizeForMatch(evidence).toLowerCase();
  const normalized = normalizeForMatch(text);
  for (const source of patterns) {
    const pattern = new RegExp(source, "gi");
    for (const match of normalized.matchAll(pattern)) {
      if (!haystack.includes(match[0].toLowerCase())) return false;
    }
  }
  return true;
}

function explanationStaysWithinEvidence(
  explanation: string,
  evidence: string,
): boolean {
  return textStaysWithinEvidence(
    explanation,
    evidence,
    EXPLANATION_UNSUPPORTED_ASSERTION_PATTERNS,
  );
}

type SeoSpecialty = "affiliate_seo" | "local_seo" | "geo";

const SPECIALTY_DISTINCTION =
  /\brather than\b|\binstead of\b|\bunlike\b|\bwhereas\b|\bdifferent\b|\bdistinct\b|\bnot the same\b|\bas opposed\b|\bdoes(?:n't| not) match\b|\bdo not match\b|\bmismatch(?:ed)?\b|\blimited connection\b|\bonly shares?\b|\bother than\b|\bplutôt que\b|\bau lieu\b|\bdifférent|\bdiferente\b|\bdistint[oa]\b|\bdivers[oa]\b|\banstatt\b|\banders als\b|\bunterschiedlich\b|\bnicht dasselbe\b|\binvece di\b|\bem vez de\b|\ben lugar de\b/i;

function hasSeoTerm(text: string): boolean {
  return /\bseo\b/i.test(text) || /\bsearch\s+engine\s+optimization\b/i.test(text);
}

function hasAffiliateTerm(text: string): boolean {
  return /\baffili|\bafiliad/i.test(text);
}

function hasLocalSeoTerm(text: string): boolean {
  return (
    /\blocal[\s-]+seo\b/i.test(text) ||
    /\bseo[\s-]+local\b/i.test(text) ||
    /\blokales?\s+seo\b/i.test(text) ||
    /\blocal\s+search\s+engine\s+optimization\b/i.test(text)
  );
}

function hasGeoTerm(text: string): boolean {
  if (/\bgenerative\s+engine\s+optimization\b/i.test(text)) return true;
  return /(?:^|[^a-z0-9-])geo(?:[^a-z0-9-]|$)/i.test(text);
}

function seoSpecialties(text: string): SeoSpecialty[] {
  const found: SeoSpecialty[] = [];
  if (hasSeoTerm(text) && hasAffiliateTerm(text)) found.push("affiliate_seo");
  if (hasLocalSeoTerm(text)) found.push("local_seo");
  if (hasGeoTerm(text)) found.push("geo");
  return found;
}

function explanationMentionsSpecialty(text: string, specialty: SeoSpecialty): boolean {
  if (specialty === "affiliate_seo") return hasAffiliateTerm(text);
  if (specialty === "local_seo") return hasLocalSeoTerm(text);
  return hasGeoTerm(text);
}

/**
 * Affiliate SEO, local SEO, and GEO share wording but are different specialties.
 * A conflicting title stays discoverable; its explanation must name the difference.
 */
function explanationAcknowledgesSpecialtyDistinction(
  explanation: string,
  objective: string,
  title: string,
): boolean {
  const objectiveSpecialties = new Set(seoSpecialties(objective));
  const conflicts = seoSpecialties(title).filter(
    (specialty) => !objectiveSpecialties.has(specialty),
  );
  if (conflicts.length === 0) return true;
  if (!SPECIALTY_DISTINCTION.test(explanation)) return false;
  return conflicts.every((specialty) =>
    explanationMentionsSpecialty(explanation, specialty),
  );
}

const HOMEOWNER_AUDIENCE_PATTERN =
  /\b(?:home\s*-?\s*owners?|customers?|residents?|diy)\b/i;
const PROFESSIONAL_AUDIENCE_PATTERN =
  /\b(?:subcontractors?|contractors?|professionals?|tradespeople|tradesperson|plumbers?|electricians?|roofers?|builders?|hvac)\b/i;

export type CommunityAudienceEvidence =
  | "homeowner_or_customer"
  | "contractor_or_professional"
  | "mixed";

/** Audience signal from title and snippet only. Null when the listing does not say. */
export function communityAudienceEvidence(
  title: string,
  snippet: string,
): CommunityAudienceEvidence | null {
  const evidence = `${title}\n${snippet}`;
  const homeowner = HOMEOWNER_AUDIENCE_PATTERN.test(evidence);
  const professional = PROFESSIONAL_AUDIENCE_PATTERN.test(evidence);
  if (homeowner && professional) return "mixed";
  if (homeowner) return "homeowner_or_customer";
  if (professional) return "contractor_or_professional";
  return null;
}

const GENERIC_BUSINESS_FACT_WORDS = new Set([
  "business",
  "businesses",
  "local",
  "locally",
  "service",
  "services",
  "company",
  "companies",
  "product",
  "products",
  "offering",
  "offerings",
  "area",
  "areas",
  "care",
  "focus",
  "focused",
  "focusing",
  "group",
  "groups",
  "help",
  "helping",
  "helps",
  "need",
  "needs",
  "note",
  "notes",
  "people",
  "plain",
  "practice",
  "practices",
  "share",
  "sharing",
  "specific",
  "team",
  "teams",
  "work",
  "working",
  "works",
]);

const SHORT_DISTINCTIVE_TOKENS = new Set(["seo", "geo", "hvac", "cpa", "ppc", "sem"]);

const FACT_LEMMA_GROUPS: readonly (readonly string[])[] = [
  ["dental", "dentist", "dentists", "dentistry"],
  ["aesthetic", "aesthetics", "esthetic", "esthetics"],
  ["pediatric", "pediatrics", "paediatric", "paediatrics"],
  ["orthodontic", "orthodontics", "orthodontist", "orthodontists"],
  ["preventive", "prevention", "preventative"],
];

const MORPHOLOGY_SUFFIX =
  /^(?:s|es|ed|ing|er|ers|or|ors|ion|tion|ation|ment|al|ly|ive|ist|ists|y)$/;

function textTokens(value: string): string[] {
  return value.toLowerCase().match(/[0-9a-z\u00c0-\u024f]+/g) ?? [];
}

function factLemma(word: string): string {
  const folded = word.toLowerCase();
  for (const group of FACT_LEMMA_GROUPS) {
    if (group.includes(folded)) return group[0];
  }
  let singular = folded;
  if (folded.endsWith("ies") && folded.length >= 6) {
    singular = `${folded.slice(0, -3)}y`;
  } else if (folded.endsWith("s") && folded.length >= 5) {
    singular = folded.slice(0, -1);
  }
  if (singular !== folded) {
    for (const group of FACT_LEMMA_GROUPS) {
      if (group.includes(singular)) return group[0];
    }
    return singular;
  }
  return folded;
}

function isGenericFactWord(word: string): boolean {
  return (
    GENERIC_BUSINESS_FACT_WORDS.has(word) ||
    GENERIC_BUSINESS_FACT_WORDS.has(factLemma(word))
  );
}

function morphologicalVariant(left: string, right: string): boolean {
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < 6 || !longer.startsWith(shorter)) return false;
  return MORPHOLOGY_SUFFIX.test(longer.slice(shorter.length));
}

function factsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const a = factLemma(left);
  const b = factLemma(right);
  if (a === b) return true;
  return morphologicalVariant(a, b);
}

function distinctiveFactTokens(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const word of textTokens(value)) {
    if (CLAIM_STOP_WORDS.has(word) || isGenericFactWord(word)) continue;
    if (word.length < 4 && !SHORT_DISTINCTIVE_TOKENS.has(word)) continue;
    const key = factLemma(word);
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(word);
  }
  return tokens;
}

function tokenCovered(token: string, tokens: readonly string[]): boolean {
  return tokens.some((candidate) => factsMatch(token, candidate));
}

function businessFactValues(context: string): string {
  return context
    .split("\n")
    .map((line) => {
      const separator = line.indexOf(": ");
      return separator >= 0 ? line.slice(separator + 2) : "";
    })
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

/**
 * When Brain has a concrete fact that the objective does not already state, the paste
 * draft must use that fact or a recognized paraphrase. Generic words and field labels
 * are not facts. If nothing distinctive remains, the draft is unavailable.
 */
function supportedBusinessFactGroundsDraft(
  text: string,
  objective: string,
  businessContext: string,
): boolean {
  if (!communityBusinessContextHasFacts(businessContext)) return true;
  const facts = distinctiveFactTokens(businessFactValues(businessContext));
  if (facts.length === 0) return false;
  const objectiveTokens = distinctiveFactTokens(objective);
  const extras = facts.filter((token) => !tokenCovered(token, objectiveTokens));
  const required = extras.length > 0 ? extras : facts;
  const draftTokens = textTokens(text);
  return required.some((token) => tokenCovered(token, draftTokens));
}

function claimTokens(value: string): string[] {
  return textTokens(value).filter((word) => {
    if (CLAIM_STOP_WORDS.has(word) || isGenericFactWord(word)) return false;
    return word.length >= 4 || SHORT_DISTINCTIVE_TOKENS.has(word);
  });
}

function wordGrounded(word: string, haystack: string): boolean {
  if (haystack.includes(word)) return true;
  if (word.endsWith("s") && word.length >= 5 && haystack.includes(word.slice(0, -1))) {
    return true;
  }
  return textTokens(haystack).some((token) => factsMatch(word, token));
}

function claimWordsAreGrounded(value: string, haystack: string): boolean {
  const words = claimTokens(value);
  if (words.length === 0) return false;
  return words.every((word) => wordGrounded(word, haystack));
}

function claimGround(objective: string, businessContext: string): string {
  if (!communityBusinessContextHasFacts(businessContext)) return objective;
  return `${objective}\n${businessContext}`;
}

function serviceClaimsAreGrounded(text: string, ground: string): boolean {
  const haystack = ground.toLowerCase();
  for (const match of text.matchAll(SERVICE_CLAIM_PATTERN)) {
    if (!claimWordsAreGrounded(match[1] ?? "", haystack)) return false;
  }
  return true;
}

function possessiveBusinessClaimsAreGrounded(
  text: string,
  ground: string,
  hasFacts: boolean,
): boolean {
  const haystack = ground.toLowerCase();
  for (const match of text.matchAll(POSSESSIVE_BUSINESS_PATTERN)) {
    const noun = (match[1] ?? "").toLowerCase();
    if (noun === "company" || noun === "business") {
      if (!hasFacts && !haystack.includes(noun)) return false;
      continue;
    }
    if (!haystack.includes(noun)) return false;
  }
  return true;
}

function locationClaimsAreGrounded(text: string, ground: string): boolean {
  const haystack = ground.toLowerCase();
  for (const match of text.matchAll(LOCATION_CLAIM_PATTERN)) {
    if (!claimWordsAreGrounded(match[1] ?? "", haystack)) return false;
  }
  return true;
}

function collapseQualificationText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedQualificationText(
  value: unknown,
  minLength: number,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const collapsed = collapseQualificationText(value);
  if (!collapsed || collapsed.length < minLength || collapsed.length > maxLength) {
    return null;
  }
  return collapsed;
}

function objectiveStatesPosterRole(objective: string, role: string): boolean {
  const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = normalizeForMatch(objective);
  return (
    new RegExp(
      String.raw`\b(?:i am|i'm|we are|we're)\s+(?:a|an)\s+${escaped}\b`,
      "i",
    ).test(text) ||
    new RegExp(String.raw`\bas an?\s+${escaped}\b`, "i").test(text)
  );
}

function organizationIdentityText(businessContext: string): string {
  return businessContext
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !ORGANIZATION_ROLE_EXCLUDED_LABELS.test(line))
    .join("\n");
}

/**
 * Audience, style, and geography do not make the organization that role.
 * Missing Brain context does not contradict a role the objective states.
 */
function posterRoleCompatibleWithOrganization(
  role: string,
  businessContext: string,
): boolean {
  if (!communityBusinessContextHasFacts(businessContext)) return true;
  const identity = organizationIdentityText(businessContext);
  if (!identity) return false;
  return objectiveStatesPosterRole(identity, role);
}

function buyerRoleEstablishedAndCompatible(
  objective: string,
  businessContext: string,
): boolean {
  return BUYER_POSTER_ROLES.some(
    (role) =>
      objectiveStatesPosterRole(objective, role) &&
      posterRoleCompatibleWithOrganization(role, businessContext),
  );
}

function matchesSeekerStyle(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return SEEKER_STYLE_PATTERNS.some((source) =>
    new RegExp(source, "i").test(normalized),
  );
}

/**
 * Seeker wording asks the community for a service, agency, or provider.
 * It remains valid only when the objective states a buyer role and the
 * organization context agrees. Primary audience is not that agreement.
 * Missing Brain context does not invent a contradicting organization.
 */
function seekerStyleDraftIsUnsupported(
  text: string,
  objective: string,
  businessContext: string,
): boolean {
  if (!matchesSeekerStyle(text)) return false;
  return !buyerRoleEstablishedAndCompatible(objective, businessContext);
}

function posterRoleClaimsAreGrounded(
  text: string,
  objective: string,
  businessContext: string,
): boolean {
  const normalized = normalizeForMatch(text);
  for (const source of POSTER_ROLE_PATTERNS) {
    const pattern = new RegExp(source, "gi");
    for (const match of normalized.matchAll(pattern)) {
      const role = match[1];
      if (!role || !objectiveStatesPosterRole(objective, role)) return false;
      if (!posterRoleCompatibleWithOrganization(role, businessContext)) return false;
    }
  }
  return true;
}

function speakerRoleIsUnsupported(
  text: string,
  objective: string,
  businessContext: string,
): boolean {
  if (!posterRoleClaimsAreGrounded(text, objective, businessContext)) return true;
  return seekerStyleDraftIsUnsupported(text, objective, businessContext);
}

function contributionClaimsAreGrounded(
  text: string,
  evidence: string,
  objective: string,
  businessContext: string,
): boolean {
  if (!textStaysWithinEvidence(text, evidence, SENSITIVE_PATTERNS)) return false;
  if (!textStaysWithinEvidence(text, evidence, UNSUPPORTED_GROUP_ASSERTION_PATTERNS)) {
    return false;
  }
  const ground = claimGround(objective, businessContext);
  const hasFacts = communityBusinessContextHasFacts(businessContext);
  if (!textStaysWithinEvidence(text, ground, QUALITY_AND_GUARANTEE_PATTERNS)) {
    return false;
  }
  if (!serviceClaimsAreGrounded(text, ground)) return false;
  if (!possessiveBusinessClaimsAreGrounded(text, ground, hasFacts)) return false;
  if (!locationClaimsAreGrounded(text, ground)) return false;
  if (!textStaysWithinEvidence(text, objective, POSTER_POSSESSION_PATTERNS)) {
    return false;
  }
  return !speakerRoleIsUnsupported(text, objective, businessContext);
}

export function isImperativeEngagementGuidance(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return IMPERATIVE_GUIDANCE_PATTERNS.some((source) =>
    new RegExp(source, "i").test(normalized),
  );
}

export function engagementGuidanceFromQualification(
  guidance: unknown,
  evidence: string,
  objective: string,
  businessContext = "",
): string | null {
  const collapsed = boundedQualificationText(
    guidance,
    COMMUNITY_DISCOVERY_GUIDANCE_MIN_LENGTH,
    COMMUNITY_DISCOVERY_GUIDANCE_MAX_LENGTH,
  );
  if (!collapsed) return null;
  if (!contributionClaimsAreGrounded(collapsed, evidence, objective, businessContext)) {
    return null;
  }
  return collapsed;
}

export function readyToPasteMessageFromQualification(
  message: unknown,
  evidence: string,
  objective: string,
  businessContext = "",
): string | null {
  const collapsed = boundedQualificationText(
    message,
    COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH,
    COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH,
  );
  if (!collapsed) return null;
  if (isImperativeEngagementGuidance(collapsed)) return null;
  if (!contributionClaimsAreGrounded(collapsed, evidence, objective, businessContext)) {
    return null;
  }
  if (!supportedBusinessFactGroundsDraft(collapsed, objective, businessContext)) {
    return null;
  }
  return collapsed;
}

function firstProvidedText(result: object, keys: readonly string[]): unknown {
  const record = result as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (typeof value === "string" && collapseQualificationText(value)) return value;
  }
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function textWasProvided(value: unknown): boolean {
  return typeof value === "string" && collapseQualificationText(value).length > 0;
}

function matchedQualificationCandidate(
  result: Record<string, unknown>,
  byIdentity: ReadonlyMap<string, CommunityQualificationCandidate>,
  byUrl: ReadonlyMap<string, CommunityQualificationCandidate>,
): CommunityQualificationCandidate | null {
  const identity =
    typeof result.canonicalIdentity === "string" ? result.canonicalIdentity : "";
  const url = typeof result.canonicalUrl === "string" ? result.canonicalUrl : "";
  if (identity) {
    const candidate = byIdentity.get(identity);
    if (!candidate) return null;
    if (url && url !== candidate.canonicalUrl) return null;
    return candidate;
  }
  if (!url) return null;
  return byUrl.get(url) ?? null;
}

export function parseCommunityQualification(
  content: string,
  objective: string,
  candidates: readonly CommunityQualificationCandidate[],
  businessContext = COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK,
): {
  explanations: ReadonlyMap<string, string>;
  suggestions: ReadonlyMap<string, string>;
  engagementGuidance: ReadonlyMap<string, string>;
  readyToPasteUnavailable: ReadonlySet<string>;
  diagnostics: CommunityQualificationDiagnosticCode[];
} | null {
  const payload = extractJsonObject(content);
  if (!payload || typeof payload !== "object" || !("results" in payload)) {
    return null;
  }
  if (!Array.isArray(payload.results)) return null;

  const byIdentity = new Map(
    candidates.map((candidate) => [candidate.canonicalIdentity, candidate]),
  );
  const byUrl = new Map(
    candidates.map((candidate) => [candidate.canonicalUrl, candidate]),
  );
  const explanations = new Map<string, string>();
  const suggestions = new Map<string, string>();
  const engagementGuidance = new Map<string, string>();
  const readyToPasteUnavailable = new Set<string>();
  const seen = new Set<string>();
  const diagnostics: CommunityQualificationDiagnosticCode[] = [];
  const groundedBusinessContext = boundCommunityDiscoveryBusinessContext(businessContext);

  for (const result of payload.results) {
    if (!result || typeof result !== "object") continue;
    const record = result as Record<string, unknown>;
    const candidate = matchedQualificationCandidate(record, byIdentity, byUrl);
    if (!candidate) {
      diagnostics.push("identity_mismatch");
      continue;
    }
    if (seen.has(candidate.canonicalIdentity)) {
      diagnostics.push("duplicate_identity");
      continue;
    }
    seen.add(candidate.canonicalIdentity);
    const evidence = `${objective}\n${candidate.title}\n${candidate.snippet}\n${candidate.canonicalUrl}`;
    const explanationInput = firstProvidedText(record, [
      "relevanceExplanation",
      "explanation",
    ]);
    const explanation = explanationFromQualification(explanationInput, evidence, {
      objective,
      title: candidate.title,
    });
    if (explanation) explanations.set(candidate.canonicalIdentity, explanation);
    else if (textWasProvided(explanationInput)) diagnostics.push("explanation_rejected");

    const messageInput = firstProvidedText(record, [
      "readyToPasteMessage",
      "suggestedContribution",
    ]);
    const guidanceInput = firstProvidedText(record, ["engagementGuidance"]);
    const message = readyToPasteMessageFromQualification(
      messageInput,
      evidence,
      objective,
      groundedBusinessContext,
    );
    let guidance = engagementGuidanceFromQualification(
      guidanceInput,
      evidence,
      objective,
      groundedBusinessContext,
    );
    const messageWasProvided = textWasProvided(messageInput);
    const guidanceWasProvided = textWasProvided(guidanceInput);
    if (messageWasProvided && !message) {
      diagnostics.push("contribution_rejected");
      if (
        typeof messageInput === "string" &&
        speakerRoleIsUnsupported(
          collapseQualificationText(messageInput),
          objective,
          groundedBusinessContext,
        )
      ) {
        diagnostics.push("speaker_role_rejected");
      }
    }
    if (guidanceWasProvided && !guidance) diagnostics.push("contribution_rejected");
    if (!message && messageWasProvided && !guidance) {
      const relocated = engagementGuidanceFromQualification(
        messageInput,
        evidence,
        objective,
        groundedBusinessContext,
      );
      if (
        relocated &&
        isImperativeEngagementGuidance(collapseQualificationText(String(messageInput)))
      ) {
        guidance = relocated;
      }
    }

    if (message) suggestions.set(candidate.canonicalIdentity, message);
    if (guidance) engagementGuidance.set(candidate.canonicalIdentity, guidance);
    if (
      !message &&
      (Boolean(guidance) || messageWasProvided || (guidanceWasProvided && !guidance))
    ) {
      readyToPasteUnavailable.add(candidate.canonicalIdentity);
    }
  }

  return {
    explanations,
    suggestions,
    engagementGuidance,
    readyToPasteUnavailable,
    diagnostics,
  };
}

function readQualificationCompletion(
  value: string | CommunityQualificationCompletion,
): { content: string; finishReason: string | null; completionTokens: number | null } {
  if (typeof value === "string") {
    return { content: value, finishReason: null, completionTokens: null };
  }
  return {
    content: value.content,
    finishReason: value.finishReason ?? null,
    completionTokens:
      typeof value.completionTokens === "number" ? value.completionTokens : null,
  };
}

function jsonSyntaxParses(content: string): boolean {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    JSON.parse(candidate);
    return true;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return false;
    try {
      JSON.parse(candidate.slice(start, end + 1));
      return true;
    } catch {
      return false;
    }
  }
}

/** Closed classification of one qualification payload. Null when the schema can be read. */
export function classifyCommunityQualificationContent(
  content: string,
  finishReason: string | null,
): Extract<
  CommunityQualificationDiagnosticCode,
  "empty_response" | "malformed_json" | "truncated_response" | "schema_failure"
> | null {
  if (!content.trim()) return "empty_response";
  const truncated = finishReason === "length";
  const payload = extractJsonObject(content);
  const schemaOk =
    !!payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray((payload as { results?: unknown }).results);
  if (schemaOk) return null;
  if (truncated) return "truncated_response";
  if (!jsonSyntaxParses(content)) return "malformed_json";
  return "schema_failure";
}

const DIAGNOSTIC_FINISH_REASONS = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
  "error",
]);

function closedFinishReason(finishReason: string | null): string {
  if (!finishReason) return "none";
  const normalized = finishReason.trim().toLowerCase();
  if (DIAGNOSTIC_FINISH_REASONS.has(normalized)) return normalized;
  if (/^[a-z0-9_]{1,32}$/.test(normalized)) return "other";
  return "none";
}

function closedCompletionTokens(completionTokens: number | null): string {
  if (completionTokens === null || !Number.isFinite(completionTokens)) return "none";
  const tokens = Math.floor(completionTokens);
  if (tokens < 0 || tokens > 100_000) return "none";
  return String(tokens);
}

/** One privacy-safe log line. It never includes objectives, prompts, or generated text. */
export function formatCommunityQualificationDiagnostic(input: {
  codes: readonly string[];
  finishReason: string | null;
  completionTokens: number | null;
}): string {
  const counts = new Map<CommunityQualificationDiagnosticCode, number>();
  for (const code of input.codes) {
    if (!DIAGNOSTIC_CODE_SET.has(code)) continue;
    const closed = code as CommunityQualificationDiagnosticCode;
    counts.set(closed, (counts.get(closed) ?? 0) + 1);
  }
  const countText = COMMUNITY_QUALIFICATION_DIAGNOSTIC_CODES.filter((code) =>
    counts.has(code),
  )
    .map((code) => `${code}=${counts.get(code)}`)
    .join(",");
  return [
    "[ATHENA_COMMUNITY_QUALIFICATION]",
    `codes=${countText || "none"}`,
    `finish_reason=${closedFinishReason(input.finishReason)}`,
    `completion_tokens=${closedCompletionTokens(input.completionTokens)}`,
  ].join(" ");
}

function logCommunityQualificationDiagnostic(input: {
  codes: readonly CommunityQualificationDiagnosticCode[];
  finishReason: string | null;
  completionTokens: number | null;
}): void {
  console.info(
    formatCommunityQualificationDiagnostic({
      codes: input.codes,
      finishReason: input.finishReason,
      completionTokens: input.completionTokens,
    }),
  );
}

function userPrompt(
  objective: string,
  businessContext: string,
  candidates: readonly CommunityQualificationCandidate[],
): string {
  const blocks = candidates.map((candidate, index) => {
    const audience = communityAudienceEvidence(candidate.title, candidate.snippet);
    return [
      `${index + 1}. canonicalIdentity: ${candidate.canonicalIdentity}`,
      `url: ${candidate.canonicalUrl}`,
      `title: ${candidate.title}`,
      `snippet: ${candidate.snippet || "(none)"}`,
      ...(audience ? [`audienceEvidence: ${audience}`] : []),
    ].join("\n");
  });
  return [
    `Objective: ${objective}`,
    "",
    "Business context:",
    businessContext,
    "",
    ...blocks,
  ].join("\n");
}

export async function qualifyDiscoveredCommunities(input: {
  objective: string;
  businessContext?: string;
  candidates: readonly CommunityQualificationCandidate[];
  signal: AbortSignal;
  complete?: CommunityQualificationComplete;
}): Promise<CommunityQualificationOutcome> {
  if (input.candidates.length === 0) {
    return {
      status: "available",
      explanations: new Map(),
      suggestions: new Map(),
      engagementGuidance: new Map(),
      readyToPasteUnavailable: new Set(),
    };
  }

  if (input.signal.aborted) {
    logCommunityQualificationDiagnostic({
      codes: ["model_timeout"],
      finishReason: null,
      completionTokens: null,
    });
    return { status: "unavailable", reason: "timeout" };
  }

  const complete = input.complete ?? defaultComplete;
  const businessContext = boundCommunityDiscoveryBusinessContext(input.businessContext);
  const unavailable = (
    reason: CommunityQualificationReason,
    code: CommunityQualificationDiagnosticCode,
    finishReason: string | null = null,
    completionTokens: number | null = null,
  ): CommunityQualificationOutcome => {
    logCommunityQualificationDiagnostic({
      codes: [code],
      finishReason,
      completionTokens,
    });
    return { status: "unavailable", reason };
  };
  try {
    const completion = readQualificationCompletion(
      await complete({
        maxTokens: COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS,
        signal: input.signal,
        messages: [
          { role: "system", content: COMMUNITY_QUALIFICATION_SYSTEM_PROMPT },
          {
            role: "user",
            content: userPrompt(input.objective, businessContext, input.candidates),
          },
        ],
      }),
    );
    const failure = classifyCommunityQualificationContent(
      completion.content,
      completion.finishReason,
    );
    if (failure) {
      return unavailable(
        "invalid_response",
        failure,
        completion.finishReason,
        completion.completionTokens,
      );
    }
    const parsed = parseCommunityQualification(
      completion.content,
      input.objective,
      input.candidates,
      businessContext,
    );
    if (!parsed) {
      return unavailable(
        "invalid_response",
        "schema_failure",
        completion.finishReason,
        completion.completionTokens,
      );
    }
    logCommunityQualificationDiagnostic({
      codes: parsed.diagnostics,
      finishReason: completion.finishReason,
      completionTokens: completion.completionTokens,
    });
    return {
      status: "available",
      explanations: parsed.explanations,
      suggestions: parsed.suggestions,
      engagementGuidance: parsed.engagementGuidance,
      readyToPasteUnavailable: parsed.readyToPasteUnavailable,
    };
  } catch (error) {
    if (error instanceof OpenRouterBoundedCallError) {
      if (error.reason === "timeout") return unavailable("timeout", "model_timeout");
      if (error.reason === "unconfigured") {
        return unavailable("unconfigured", "configuration");
      }
      if (error.reason === "empty_response") {
        return unavailable("invalid_response", "empty_response");
      }
      return unavailable("error", "transport");
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return unavailable("timeout", "model_timeout");
    }
    return unavailable("error", "transport");
  }
}
