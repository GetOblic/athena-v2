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
}) => Promise<string>;

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
  "Do not imply the user is a homeowner, customer, member, or business owner unless the objective says so.",
  "Primary audience is who the business serves, not the poster's role.",
  "If the title and snippet do not establish relevance, say that they do not show a clear connection to the objective.",
  "When audienceEvidence is present, it comes only from that result's title and snippet.",
  "If audienceEvidence conflicts with the objective or the primary audience, explain that mismatch honestly and still return the result.",
  "If audienceEvidence is absent, do not assign an audience.",
  "Never invent a relevance score or a member count.",
  "Write relevanceExplanation in at most two short sentences.",
  "Write relevanceExplanation, engagementGuidance, and readyToPasteMessage in the same language as the objective.",
  "Do not claim the group is active, posts on a schedule, has rules, or grants access unless that result's title or snippet states it.",
  "engagementGuidance is optional advice about how to engage. Write at most one short sentence, or an empty string. It is not the post.",
  "readyToPasteMessage is the exact text the user could paste into the community.",
  "Write readyToPasteMessage as a complete natural-language post of at most three short sentences, grounded in the objective, the business context, and that result's title, snippet, and URL.",
  "When communication style is present, follow it. Do not invent a style.",
  "Do not write readyToPasteMessage as an instruction such as 'Post a request for recommendations'.",
  "Do not invent group rules, member activity, discussion content, or claims about the user's business.",
  "If you cannot ground a field, use an empty string.",
  'Return JSON only: {"results":[{"canonicalIdentity":"string","canonicalUrl":"string","relevanceExplanation":"string","engagementGuidance":"string","readyToPasteMessage":"string"}]}',
].join("\n");

function defaultComplete(
  input: Parameters<CommunityQualificationComplete>[0],
): Promise<string> {
  const model = resolveCommunityQualificationModel();
  if (model.status !== "configured") {
    return Promise.reject(new OpenRouterBoundedCallError("unconfigured"));
  }
  return callOpenRouterBounded({
    messages: input.messages,
    maxTokens: input.maxTokens,
    temperature: 0,
    signal: input.signal,
    model: model.model,
  });
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

function contentWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^0-9a-z\u00c0-\u024f]+/)
    .filter((word) => word.length >= 4 && !CLAIM_STOP_WORDS.has(word));
}

function wordGrounded(word: string, haystack: string): boolean {
  if (haystack.includes(word)) return true;
  if (word.endsWith("s") && word.length >= 5 && haystack.includes(word.slice(0, -1))) {
    return true;
  }
  return false;
}

function claimWordsAreGrounded(value: string, haystack: string): boolean {
  const words = contentWords(value);
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

function posterRoleClaimsAreGrounded(text: string, objective: string): boolean {
  const normalized = normalizeForMatch(text);
  for (const source of POSTER_ROLE_PATTERNS) {
    const pattern = new RegExp(source, "gi");
    for (const match of normalized.matchAll(pattern)) {
      const role = match[1];
      if (!role || !objectiveStatesPosterRole(objective, role)) return false;
    }
  }
  return true;
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
  return posterRoleClaimsAreGrounded(text, objective);
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
  const groundedBusinessContext = boundCommunityDiscoveryBusinessContext(businessContext);

  for (const result of payload.results) {
    if (!result || typeof result !== "object") continue;
    const record = result as Record<string, unknown>;
    const candidate = matchedQualificationCandidate(record, byIdentity, byUrl);
    if (!candidate || seen.has(candidate.canonicalIdentity)) continue;
    seen.add(candidate.canonicalIdentity);
    const evidence = `${objective}\n${candidate.title}\n${candidate.snippet}\n${candidate.canonicalUrl}`;
    const explanation = explanationFromQualification(
      firstProvidedText(record, ["relevanceExplanation", "explanation"]),
      evidence,
    );
    if (explanation) explanations.set(candidate.canonicalIdentity, explanation);

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
  };
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
    return { status: "unavailable", reason: "timeout" };
  }

  const complete = input.complete ?? defaultComplete;
  const businessContext = boundCommunityDiscoveryBusinessContext(input.businessContext);
  try {
    const content = await complete({
      maxTokens: COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS,
      signal: input.signal,
      messages: [
        { role: "system", content: COMMUNITY_QUALIFICATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: userPrompt(input.objective, businessContext, input.candidates),
        },
      ],
    });
    const parsed = parseCommunityQualification(
      content,
      input.objective,
      input.candidates,
      businessContext,
    );
    if (!parsed) {
      return { status: "unavailable", reason: "invalid_response" };
    }
    return {
      status: "available",
      explanations: parsed.explanations,
      suggestions: parsed.suggestions,
      engagementGuidance: parsed.engagementGuidance,
      readyToPasteUnavailable: parsed.readyToPasteUnavailable,
    };
  } catch (error) {
    if (error instanceof OpenRouterBoundedCallError) {
      if (error.reason === "timeout") {
        return { status: "unavailable", reason: "timeout" };
      }
      if (error.reason === "unconfigured") {
        return { status: "unavailable", reason: "unconfigured" };
      }
      return { status: "unavailable", reason: "error" };
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return { status: "unavailable", reason: "timeout" };
    }
    return { status: "unavailable", reason: "error" };
  }
}
