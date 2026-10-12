import {
  callOpenRouterBounded,
  OpenRouterBoundedCallError,
  type OpenRouterBoundedMessage,
} from "@/lib/openrouter";
import { resolveCommunityQualificationModel } from "@/services/communityDiscovery/communityQualificationModel";
import {
  COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH,
  COMMUNITY_DISCOVERY_EXPLANATION_MIN_LENGTH,
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
      suggestions: ReadonlyMap<string, string>;
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

const SUGGESTION_INVENTION_PATTERNS = [
  String.raw`\b(?:members|people|someone)\s+(?:discussed|were discussing|posted)\b`,
  String.raw`\b(?:recent|previous)\s+(?:post|thread|discussion|comment)s?\b`,
  String.raw`\bI\s+(?:saw|read|noticed)\s+(?:a\s+|the\s+)?(?:post|thread|comment|discussion)\b`,
  String.raw`\b(?:our|my)\s+(?:company|business|product|service|brand)\b`,
  String.raw`\bwe\s+(?:sell|offer|provide|make|build|specialize)\b`,
];

export const COMMUNITY_QUALIFICATION_SYSTEM_PROMPT = [
  "You explain whether each public community search result is relevant to the user's objective.",
  "Use only the objective, the result title, the result snippet, and the result URL.",
  "Do not invent group activity, member counts, rules, descriptions, or access.",
  "Do not claim the community was opened, joined, or verified.",
  "If the title and snippet do not establish relevance, say that they do not show a clear connection to the objective.",
  "Write at most two sentences for each result.",
  "Do not mention member counts, activity, rules, or access unless those words appear in that result's title or snippet.",
  "Also write one short suggested contribution the user could post.",
  "Ground that contribution only in the objective and that result's title, snippet, and URL.",
  "Do not invent group rules, member activity, discussion content, or claims about the user's business.",
  "If you cannot ground a contribution, use an empty string.",
  "Write the contribution as at most one sentence.",
  'Return JSON only: {"results":[{"canonicalIdentity":"string","explanation":"string","suggestedContribution":"string"}]}',
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

function textStaysWithinEvidence(
  text: string,
  evidence: string,
  patterns: readonly string[],
): boolean {
  const haystack = evidence.toLowerCase();
  for (const source of patterns) {
    const pattern = new RegExp(source, "gi");
    for (const match of text.matchAll(pattern)) {
      if (!haystack.includes(match[0].toLowerCase())) return false;
    }
  }
  return true;
}

function explanationStaysWithinEvidence(
  explanation: string,
  evidence: string,
): boolean {
  return textStaysWithinEvidence(explanation, evidence, SENSITIVE_PATTERNS);
}

function collapseQualificationText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestionFromQualification(
  suggestion: unknown,
  evidence: string,
): string | null {
  if (typeof suggestion !== "string") return null;
  const collapsed = collapseQualificationText(suggestion);
  if (!collapsed) return null;
  if (
    collapsed.length < COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH ||
    collapsed.length > COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH
  ) {
    return null;
  }
  if (!explanationStaysWithinEvidence(collapsed, evidence)) return null;
  if (!textStaysWithinEvidence(collapsed, evidence, SUGGESTION_INVENTION_PATTERNS)) {
    return null;
  }
  return collapsed;
}

export function parseCommunityQualification(
  content: string,
  objective: string,
  candidates: readonly CommunityQualificationCandidate[],
): {
  explanations: ReadonlyMap<string, string>;
  suggestions: ReadonlyMap<string, string>;
} | null {
  const payload = extractJsonObject(content);
  if (!payload || typeof payload !== "object" || !("results" in payload)) {
    return null;
  }
  if (!Array.isArray(payload.results)) return null;

  const allowed = new Map(
    candidates.map((candidate) => [candidate.canonicalIdentity, candidate]),
  );
  const explanations = new Map<string, string>();
  const suggestions = new Map<string, string>();

  for (const result of payload.results) {
    if (!result || typeof result !== "object") continue;
    if (!("canonicalIdentity" in result) || !("explanation" in result)) continue;
    if (typeof result.canonicalIdentity !== "string") continue;
    const candidate = allowed.get(result.canonicalIdentity);
    if (!candidate || explanations.has(candidate.canonicalIdentity)) continue;
    const evidence = `${objective}\n${candidate.title}\n${candidate.snippet}\n${candidate.canonicalUrl}`;
    const explanation = explanationFromQualification(result.explanation, evidence);
    if (!explanation) continue;
    explanations.set(candidate.canonicalIdentity, explanation);
    const suggestion = suggestionFromQualification(
      "suggestedContribution" in result ? result.suggestedContribution : undefined,
      evidence,
    );
    if (suggestion) suggestions.set(candidate.canonicalIdentity, suggestion);
  }

  return { explanations, suggestions };
}

function userPrompt(
  objective: string,
  candidates: readonly CommunityQualificationCandidate[],
): string {
  const blocks = candidates.map((candidate, index) =>
    [
      `${index + 1}. canonicalIdentity: ${candidate.canonicalIdentity}`,
      `url: ${candidate.canonicalUrl}`,
      `title: ${candidate.title}`,
      `snippet: ${candidate.snippet || "(none)"}`,
    ].join("\n"),
  );
  return [`Objective: ${objective}`, "", ...blocks].join("\n");
}

export async function qualifyDiscoveredCommunities(input: {
  objective: string;
  candidates: readonly CommunityQualificationCandidate[];
  signal: AbortSignal;
  complete?: CommunityQualificationComplete;
}): Promise<CommunityQualificationOutcome> {
  if (input.candidates.length === 0) {
    return {
      status: "available",
      explanations: new Map(),
      suggestions: new Map(),
    };
  }

  if (input.signal.aborted) {
    return { status: "unavailable", reason: "timeout" };
  }

  const complete = input.complete ?? defaultComplete;
  try {
    const content = await complete({
      maxTokens: COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS,
      signal: input.signal,
      messages: [
        { role: "system", content: COMMUNITY_QUALIFICATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: userPrompt(input.objective, input.candidates),
        },
      ],
    });
    const parsed = parseCommunityQualification(
      content,
      input.objective,
      input.candidates,
    );
    if (!parsed) {
      return { status: "unavailable", reason: "invalid_response" };
    }
    return {
      status: "available",
      explanations: parsed.explanations,
      suggestions: parsed.suggestions,
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
