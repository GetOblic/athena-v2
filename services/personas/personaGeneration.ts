/**
 * Athena "Generate Persona" — synchronous structured candidate generation.
 * Never persists. Confirmed create reuses POST /api/personas.
 */

import { randomUUID } from "node:crypto";
import {
  buildPersonaGenerationPrompt,
  PERSONA_GENERATION_OUTPUT_FIELDS,
  PERSONA_GENERATION_PROMPT_VERSION,
} from "@/services/ai/prompts/personaGenerationPrompt";
import { generateReview } from "@/services/aiService";
import { buildBrainContextForOrganization } from "@/services/brain/brainContextBuilder";
import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import { preparePersonaCreateRow } from "@/services/personas/personaNormalization";
import {
  getPersonas,
  type Persona,
} from "@/services/personas/personaService";
import {
  hasMeaningfulPersonaContent,
  normalizeOptionalText,
} from "@/services/personas/personaUtils";

export { PERSONA_GENERATION_PROMPT_VERSION };

export const PERSONA_GENERATION_INSTRUCTION_MAX_LENGTH = 2_000;

/** Max existing Personas included in the generation prompt. */
export const PERSONA_GENERATION_EXISTING_PERSONA_LIMIT = 8;

/** Soft pool from newest Personas before descriptive ranking. */
export const PERSONA_GENERATION_EXISTING_PERSONA_POOL = 20;

/** Per-field truncation for existing-Persona prompt summaries. */
export const PERSONA_GENERATION_FIELD_TRUNCATE = 220;

/** Total character budget for the existing-Personas prompt block. */
export const PERSONA_GENERATION_EXISTING_BLOCK_MAX_CHARS = 8_000;

/** Total character budget for the Brain prompt block. */
export const PERSONA_GENERATION_BRAIN_BLOCK_MAX_CHARS = 14_000;

/**
 * Novelty rule (deterministic, documented):
 * The candidate must meaningfully differ from every existing Persona in at least
 * MIN_STRATEGIC_DIMENSION_DIFFERENCES strategic dimensions.
 *
 * A dimension counts as different only when the candidate supplies substantive
 * content for that dimension, and either:
 * - the existing Persona lacks substantive content for that dimension (gap), or
 * - both sides are substantive and word-set Jaccard similarity is below
 *   NOVELTY_JACCARD_MAX.
 *
 * Candidate blanks / insubstantial text never earn a novelty point.
 * Cosmetic identity fields (name, pronouns, age) are outside strategic dimensions.
 */
export const MIN_STRATEGIC_DIMENSION_DIFFERENCES = 3;

/**
 * Word-set Jaccard at/above this is treated as overlapping (not a difference).
 * Kept moderately strict so padded paraphrases of the same goals/objections do
 * not manufacture three “differences” from light wording changes.
 */
export const NOVELTY_JACCARD_MAX = 0.55;

/**
 * Minimum significant tokens required for dimension text to count as substantive.
 * Prevents one-word city/role swaps and empty-ish strings from manufacturing novelty.
 */
export const NOVELTY_MIN_SUBSTANTIVE_TOKENS = 3;

export const PERSONA_GENERATION_STRATEGIC_DIMENSIONS = [
  {
    id: "role_context",
    label: "role/context",
    fields: [
      "category",
      "occupation",
      "seniority",
      "industry_context",
      "short_description",
    ],
  },
  {
    id: "goals_needs",
    label: "goals/needs",
    fields: ["goals", "needs"],
  },
  {
    id: "motivations_triggers",
    label: "motivations/triggers",
    fields: ["motivations", "buying_triggers"],
  },
  {
    id: "pain_fears_objections",
    label: "pain/fears/objections",
    fields: ["pain_points", "fears", "objections"],
  },
  {
    id: "purchase_decision",
    label: "purchase behavior/decision criteria",
    fields: ["purchase_behavior", "decision_criteria"],
  },
  {
    id: "geography_market",
    label: "geography/market",
    fields: ["location_summary", "country", "state", "city"],
  },
  {
    id: "lifestyle_context",
    label: "lifestyle/additional context",
    fields: ["lifestyle", "additional_context"],
  },
] as const;

export type PersonaGenerationCandidate = {
  [K in (typeof PERSONA_GENERATION_OUTPUT_FIELDS)[number]]?: string | null;
};

export type PersonaGenerationSuccess = {
  ok: true;
  candidate: PersonaGenerationCandidate;
  requestId: string;
  promptVersion: string;
  attempts: number;
};

export type PersonaGenerationFailureCode =
  | "VALIDATION_ERROR"
  | "BRAIN_UNAVAILABLE"
  | "MALFORMED_OUTPUT"
  | "BLANK_CANDIDATE"
  | "PLACEHOLDER_CONTENT"
  | "NOVELTY_FAILED"
  | "GENERATION_FAILED";

export class PersonaGenerationError extends Error {
  readonly code: PersonaGenerationFailureCode;
  readonly httpStatus: number;
  readonly requestId: string;
  readonly retryable: boolean;

  constructor(input: {
    code: PersonaGenerationFailureCode;
    message: string;
    httpStatus?: number;
    requestId: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "PersonaGenerationError";
    this.code = input.code;
    this.httpStatus = input.httpStatus ?? 400;
    this.requestId = input.requestId;
    this.retryable = Boolean(input.retryable);
  }
}

const PLACEHOLDER_PATTERNS = [
  /^tbd$/i,
  /^n\/?a$/i,
  /^todo$/i,
  /^placeholder$/i,
  /^lorem ipsum/i,
  /^example persona$/i,
  /^test persona$/i,
  /^xxx+$/i,
  /^your (persona|text|content) here$/i,
  /^insert .+ here$/i,
];

const SUMMARY_FIELDS = [
  "category",
  "occupation",
  "seniority",
  "industry_context",
  "short_description",
  "location_summary",
  "country",
  "state",
  "city",
  "goals",
  "needs",
  "motivations",
  "pain_points",
  "fears",
  "objections",
  "buying_triggers",
  "decision_criteria",
  "purchase_behavior",
  "lifestyle",
  "additional_context",
] as const;

export type ExistingPersonaPromptSummary = {
  index: number;
  fields: Partial<Record<(typeof SUMMARY_FIELDS)[number], string>>;
};

export type NoveltyEvaluation = {
  passes: boolean;
  closestPersonaIndex: number | null;
  maxDifferencesAgainstClosest: number;
  overlapExplanation: string;
};

export type GeneratePersonaCandidateDeps = {
  buildBrain?: typeof buildBrainContextForOrganization;
  getPersonas?: typeof getPersonas;
  generateReview?: typeof generateReview;
  requestId?: string;
};

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  if (maxLen <= 1) return "…";
  return `${value.slice(0, maxLen - 1).trimEnd()}…`;
}

function clampBlock(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Normalize optional instruction: trim, collapse runaway whitespace, length-limit. */
export function normalizePersonaGenerationInstruction(
  instruction?: string | null,
): string | null {
  if (instruction == null) return null;
  const collapsed = String(instruction)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!collapsed) return null;
  return truncateText(collapsed, PERSONA_GENERATION_INSTRUCTION_MAX_LENGTH);
}

/** Common low-information tokens removed before novelty word-set comparison. */
const NOVELTY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "them",
  "to",
  "with",
  "without",
]);

export function normalizeComparableText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(normalized: string): Set<string> {
  if (!normalized) return new Set();
  return new Set(
    normalized
      .split(" ")
      .filter((token) => token.length > 1 && !NOVELTY_STOPWORDS.has(token)),
  );
}

/** Jaccard similarity of word sets; empty/empty → 1, one empty → 0. */
export function jaccardSimilarity(a: string, b: string): number {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function dimensionText(
  record: Record<string, string | null | undefined>,
  fields: readonly string[],
): string {
  return fields
    .map((field) => normalizeOptionalText(record[field]))
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeComparableText(value))
    .filter(Boolean)
    .join(" | ");
}

/** True when normalized dimension text has enough non-stopword tokens to be strategic. */
export function isSubstantiveDimensionText(normalized: string): boolean {
  return wordSet(normalized).size >= NOVELTY_MIN_SUBSTANTIVE_TOKENS;
}

/**
 * A strategic dimension differs only when the candidate has substantive content
 * that either fills an existing gap or is sufficiently dissimilar by Jaccard.
 * Candidate blanks never count as originality.
 */
export function dimensionMeaningfullyDiffers(
  candidateText: string,
  existingText: string,
): boolean {
  const candidateSubstantive = isSubstantiveDimensionText(candidateText);
  const existingSubstantive = isSubstantiveDimensionText(existingText);

  if (!candidateSubstantive && !existingSubstantive) return false;
  // Missing / thin candidate content is not meaningful originality.
  if (!candidateSubstantive) return false;
  // Existing gap + substantive candidate content may count as a distinction.
  if (!existingSubstantive) return true;
  if (candidateText === existingText) return false;
  return jaccardSimilarity(candidateText, existingText) < NOVELTY_JACCARD_MAX;
}

function descriptiveScore(persona: Persona): number {
  let score = 0;
  for (const field of SUMMARY_FIELDS) {
    if (normalizeOptionalText(persona[field])) score += 1;
  }
  return score;
}

/**
 * Deterministic, bounded selection of existing Personas for the prompt.
 * Starts from newest records (getPersonas order), keeps a soft pool, then
 * prefers strategically descriptive entries while preserving recency among ties.
 */
export function selectExistingPersonasForGeneration(
  personas: Persona[],
): Persona[] {
  const pool = personas.slice(0, PERSONA_GENERATION_EXISTING_PERSONA_POOL);
  return [...pool]
    .map((persona, index) => ({ persona, index, score: descriptiveScore(persona) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .slice(0, PERSONA_GENERATION_EXISTING_PERSONA_LIMIT)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.persona);
}

export function summarizeExistingPersonasForGeneration(
  personas: Persona[],
): ExistingPersonaPromptSummary[] {
  const selected = selectExistingPersonasForGeneration(personas);
  return selected.map((persona, index) => {
    const fields: ExistingPersonaPromptSummary["fields"] = {};
    for (const field of SUMMARY_FIELDS) {
      const value = normalizeOptionalText(persona[field]);
      if (value) {
        fields[field] = truncateText(value, PERSONA_GENERATION_FIELD_TRUNCATE);
      }
    }
    return { index: index + 1, fields };
  });
}

export function formatExistingPersonasBlock(
  summaries: ExistingPersonaPromptSummary[],
): string {
  if (summaries.length === 0) {
    return "No existing Personas for this organization.";
  }

  const parts = summaries.map((summary) => {
    const lines = Object.entries(summary.fields).map(
      ([key, value]) => `  ${key}: ${value}`,
    );
    return `Persona ${summary.index}:\n${lines.join("\n") || "  (minimal fields)"}`;
  });

  return clampBlock(parts.join("\n\n"), PERSONA_GENERATION_EXISTING_BLOCK_MAX_CHARS);
}

/**
 * Format organization Brain for the prompt. Uses summaries and structured slices only —
 * never returns this block to the browser.
 */
export function formatBrainContextForPersonaGeneration(
  brain: BrainEngineContext | null,
): string {
  if (!brain) {
    return "No Athena Brain context was available for this organization.";
  }

  const identity = brain.businessMemory.identity;
  const knowledge = brain.knowledgeMemory.assets.slice(0, 12).map((asset) => ({
    title: asset.title,
    category: asset.category,
    assetType: asset.assetType,
    summary: asset.summary
      ? truncateText(asset.summary, PERSONA_GENERATION_FIELD_TRUNCATE)
      : null,
    tags: asset.tags.slice(0, 8),
  }));

  const domains = brain.domainMemory.domains.slice(0, 10).map((domain) => ({
    name: domain.name,
    platform: domain.platform,
    market: domain.market,
    niche: domain.niche,
    description: domain.description
      ? truncateText(domain.description, PERSONA_GENERATION_FIELD_TRUNCATE)
      : null,
    recurringQuestions: domain.recurringQuestions
      ? truncateText(domain.recurringQuestions, PERSONA_GENERATION_FIELD_TRUNCATE)
      : null,
    recurringObjections: domain.recurringObjections
      ? truncateText(
          domain.recurringObjections,
          PERSONA_GENERATION_FIELD_TRUNCATE,
        )
      : null,
    emergingTrends: domain.emergingTrends
      ? truncateText(domain.emergingTrends, PERSONA_GENERATION_FIELD_TRUNCATE)
      : null,
    athenaUnderstanding: domain.athenaUnderstanding
      ? truncateText(
          domain.athenaUnderstanding,
          PERSONA_GENERATION_FIELD_TRUNCATE,
        )
      : null,
  }));

  const opportunities = brain.opportunityMemory.recentOpportunities
    .slice(0, 8)
    .map((entry) => ({
      title: entry.title,
      status: entry.status,
      urgency: entry.urgency,
      score: entry.score,
    }));

  const discussions = brain.discussionMemory.recentDiscussions
    .slice(0, 8)
    .map((entry) => ({
      title: entry.title,
      status: entry.status,
      summary: entry.summary
        ? truncateText(entry.summary, PERSONA_GENERATION_FIELD_TRUNCATE)
        : null,
      opportunityScore: entry.opportunityScore,
    }));

  const payload = {
    organization: brain.organization,
    scope: brain.scope,
    identity: identity
      ? {
          greetingName: identity.greetingName,
          aboutYou: identity.aboutYou
            ? truncateText(identity.aboutYou, 1_200)
            : null,
          expertise: identity.expertise
            ? truncateText(identity.expertise, 1_200)
            : null,
          website: identity.website,
          brainStatus: identity.brainStatus,
          isBrainTrained: brain.businessMemory.isBrainTrained,
          completenessScore: brain.businessMemory.completenessScore,
          masterProfile: identity.masterProfile,
          homepageLearning: identity.homepageLearning
            ? truncateText(identity.homepageLearning, 1_200)
            : null,
        }
      : null,
    domains,
    knowledgeAssets: knowledge,
    communityIntelligence: brain.knowledgeMemory.communityIntelligence
      .slice(0, 5)
      .map((entry) => ({
        executiveSummary: entry.executiveSummary
          ? truncateText(entry.executiveSummary, PERSONA_GENERATION_FIELD_TRUNCATE)
          : null,
        confidence: entry.confidence,
      })),
    recentOpportunities: opportunities,
    recentDiscussions: discussions,
    assetAudiences: brain.assetMemory.targetAudiences.slice(0, 12),
    assetBusinessGoals: brain.assetMemory.businessGoals.slice(0, 12),
    contextSummary: brain.contextSummary,
  };

  return clampBlock(
    JSON.stringify(payload, null, 2),
    PERSONA_GENERATION_BRAIN_BLOCK_MAX_CHARS,
  );
}

export function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function parsePersonaGenerationCandidate(
  rawText: string,
): PersonaGenerationCandidate {
  const cleaned = stripJsonFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("MALFORMED_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MALFORMED_JSON");
  }

  const record = parsed as Record<string, unknown>;
  const candidate: PersonaGenerationCandidate = {};

  for (const field of PERSONA_GENERATION_OUTPUT_FIELDS) {
    const value = record[field];
    if (value == null) {
      candidate[field] = null;
      continue;
    }
    if (typeof value === "string") {
      candidate[field] = normalizeOptionalText(value);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      candidate[field] = normalizeOptionalText(String(value));
      continue;
    }
    // Unsupported nested shapes are ignored for that field.
    candidate[field] = null;
  }

  return candidate;
}

function containsObviousPlaceholder(
  candidate: PersonaGenerationCandidate,
): string | null {
  for (const field of PERSONA_GENERATION_OUTPUT_FIELDS) {
    const value = normalizeOptionalText(candidate[field]);
    if (!value) continue;
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(value.trim())) {
        return `${field} contains placeholder content`;
      }
    }
  }
  return null;
}

/**
 * Validate candidate for review return: meaningful content, create-contract shape,
 * no placeholders. Uses preparePersonaCreateRow with a throwaway org id for shape.
 */
export function validatePersonaGenerationCandidate(
  candidate: PersonaGenerationCandidate,
  organizationId: string,
): PersonaGenerationCandidate {
  if (!hasMeaningfulPersonaContent(candidate)) {
    throw new Error("BLANK_CANDIDATE");
  }

  const placeholder = containsObviousPlaceholder(candidate);
  if (placeholder) {
    throw new Error(`PLACEHOLDER_CONTENT:${placeholder}`);
  }

  const prepared = preparePersonaCreateRow({
    organization_id: organizationId,
    ...candidate,
    source: "generated",
  });

  const sanitized: PersonaGenerationCandidate = {};
  for (const field of PERSONA_GENERATION_OUTPUT_FIELDS) {
    sanitized[field] = prepared[field] ?? null;
  }

  if (!hasMeaningfulPersonaContent(sanitized)) {
    throw new Error("BLANK_CANDIDATE");
  }

  return sanitized;
}

export function evaluatePersonaNovelty(
  candidate: PersonaGenerationCandidate,
  existing: Persona[],
): NoveltyEvaluation {
  if (existing.length === 0) {
    return {
      passes: true,
      closestPersonaIndex: null,
      maxDifferencesAgainstClosest: MIN_STRATEGIC_DIMENSION_DIFFERENCES,
      overlapExplanation: "No existing Personas to compare.",
    };
  }

  let closestIndex: number | null = null;
  let lowestDifferences = Number.POSITIVE_INFINITY;
  let closestOverlapLabels: string[] = [];

  existing.forEach((persona, index) => {
    const differing: string[] = [];
    const overlapping: string[] = [];

    for (const dimension of PERSONA_GENERATION_STRATEGIC_DIMENSIONS) {
      const candidateText = dimensionText(candidate, dimension.fields);
      const existingText = dimensionText(
        persona as unknown as Record<string, string | null | undefined>,
        dimension.fields,
      );
      if (dimensionMeaningfullyDiffers(candidateText, existingText)) {
        differing.push(dimension.label);
      } else if (candidateText || existingText) {
        overlapping.push(dimension.label);
      }
    }

    if (differing.length < lowestDifferences) {
      lowestDifferences = differing.length;
      closestIndex = index;
      closestOverlapLabels = overlapping;
    }
  });

  const passes = lowestDifferences >= MIN_STRATEGIC_DIMENSION_DIFFERENCES;
  const overlapExplanation = passes
    ? `Candidate differs in at least ${MIN_STRATEGIC_DIMENSION_DIFFERENCES} strategic dimensions from every existing Persona.`
    : `Closest existing Persona #${(closestIndex ?? 0) + 1} overlaps on: ${
        closestOverlapLabels.join(", ") || "strategic dimensions"
      }. Meaningful differences found: ${
        Number.isFinite(lowestDifferences) ? lowestDifferences : 0
      } (need ${MIN_STRATEGIC_DIMENSION_DIFFERENCES}).`;

  return {
    passes,
    closestPersonaIndex: closestIndex,
    maxDifferencesAgainstClosest: Number.isFinite(lowestDifferences)
      ? lowestDifferences
      : 0,
    overlapExplanation,
  };
}

function toPublicCandidate(
  candidate: PersonaGenerationCandidate,
): PersonaGenerationCandidate {
  const out: PersonaGenerationCandidate = {};
  for (const field of PERSONA_GENERATION_OUTPUT_FIELDS) {
    const value = candidate[field];
    if (value != null) out[field] = value;
  }
  return out;
}

async function invokeModel(input: {
  prompt: string;
  requestId: string;
  attempt: number;
  generate: typeof generateReview;
}): Promise<string> {
  return input.generate(input.prompt, {
    generationKind: "generic_review",
    reasoningProfile: "BALANCED",
    systemPrompt:
      "You are Athena. Generate one commercially relevant Persona candidate as strict JSON from the provided Brain and existing-Persona context. Do not invent unsupported business facts.",
    regenerationRunId: `${input.requestId}:attempt-${input.attempt}`,
    stage: "persona_generation",
    promptSource: "services/ai/prompts/personaGenerationPrompt.ts",
  });
}

/**
 * Generate one Persona review candidate. Does not persist anything.
 */
export async function generatePersonaCandidate(input: {
  organizationId: string;
  instruction?: string | null;
  /** Ignored — organizationId is never accepted from the browser. */
  clientOrganizationId?: unknown;
  deps?: GeneratePersonaCandidateDeps;
}): Promise<PersonaGenerationSuccess> {
  const requestId = input.deps?.requestId ?? randomUUID();
  const organizationId = String(input.organizationId ?? "").trim();
  if (!organizationId) {
    throw new PersonaGenerationError({
      code: "VALIDATION_ERROR",
      message: "Organization context is required.",
      requestId,
      httpStatus: 401,
    });
  }

  // Explicitly ignore any client-supplied organization identifier.
  void input.clientOrganizationId;

  const instruction = normalizePersonaGenerationInstruction(input.instruction);
  const buildBrain =
    input.deps?.buildBrain ?? buildBrainContextForOrganization;
  const loadPersonas = input.deps?.getPersonas ?? getPersonas;
  const generate = input.deps?.generateReview ?? generateReview;

  let brain: BrainEngineContext | null;
  try {
    brain = await buildBrain(organizationId);
  } catch {
    throw new PersonaGenerationError({
      code: "BRAIN_UNAVAILABLE",
      message: "Athena Brain could not be loaded for this organization.",
      requestId,
      httpStatus: 503,
      retryable: true,
    });
  }

  const existingPersonas = await loadPersonas(organizationId);
  const summaries = summarizeExistingPersonasForGeneration(existingPersonas);
  const brainBlock = formatBrainContextForPersonaGeneration(brain);
  const existingBlock = formatExistingPersonasBlock(summaries);

  let noveltyHint: string | null = null;
  let lastNoveltyExplanation = "";
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    const prompt = buildPersonaGenerationPrompt({
      brainContextBlock: brainBlock,
      existingPersonasBlock: existingBlock,
      instruction,
      noveltyRetryHint: noveltyHint,
    });

    let raw: string;
    try {
      raw = await invokeModel({
        prompt,
        requestId,
        attempt,
        generate,
      });
    } catch {
      throw new PersonaGenerationError({
        code: "GENERATION_FAILED",
        message: "Athena could not generate a Persona candidate. Please try again.",
        requestId,
        httpStatus: 502,
        retryable: true,
      });
    }

    let candidate: PersonaGenerationCandidate;
    try {
      candidate = parsePersonaGenerationCandidate(raw);
    } catch {
      if (attempt < 2) {
        noveltyHint =
          "Previous response was not valid JSON. Return only a flat JSON object with Persona fields.";
        continue;
      }
      throw new PersonaGenerationError({
        code: "MALFORMED_OUTPUT",
        message: "Athena returned an unreadable Persona candidate. Please try again.",
        requestId,
        httpStatus: 422,
        retryable: true,
      });
    }

    try {
      candidate = validatePersonaGenerationCandidate(candidate, organizationId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "BLANK_CANDIDATE";
      if (reason === "BLANK_CANDIDATE") {
        if (attempt < 2) {
          noveltyHint =
            "Previous candidate was blank or lacked usable descriptive content. Populate meaningful Persona fields.";
          continue;
        }
        throw new PersonaGenerationError({
          code: "BLANK_CANDIDATE",
          message: "Athena generated an empty Persona candidate. Please try again.",
          requestId,
          httpStatus: 422,
          retryable: true,
        });
      }
      if (reason.startsWith("PLACEHOLDER_CONTENT")) {
        if (attempt < 2) {
          noveltyHint =
            "Previous candidate contained placeholder text. Use concrete Persona details or omit fields.";
          continue;
        }
        throw new PersonaGenerationError({
          code: "PLACEHOLDER_CONTENT",
          message:
            "Athena generated placeholder content instead of a usable Persona. Please try again.",
          requestId,
          httpStatus: 422,
          retryable: true,
        });
      }
      throw new PersonaGenerationError({
        code: "VALIDATION_ERROR",
        message: "Athena generated an invalid Persona candidate. Please try again.",
        requestId,
        httpStatus: 422,
        retryable: true,
      });
    }

    const novelty = evaluatePersonaNovelty(candidate, existingPersonas);
    if (!novelty.passes) {
      lastNoveltyExplanation = novelty.overlapExplanation;
      if (attempt < 2) {
        noveltyHint = novelty.overlapExplanation;
        continue;
      }
      throw new PersonaGenerationError({
        code: "NOVELTY_FAILED",
        message:
          "Athena could not generate a Persona that is sufficiently distinct from your existing Personas. Adjust your optional instruction or try again.",
        requestId,
        httpStatus: 422,
        retryable: true,
      });
    }

    return {
      ok: true,
      candidate: toPublicCandidate(candidate),
      requestId,
      promptVersion: PERSONA_GENERATION_PROMPT_VERSION,
      attempts,
    };
  }

  throw new PersonaGenerationError({
    code: "NOVELTY_FAILED",
    message:
      lastNoveltyExplanation ||
      "Athena could not generate a sufficiently distinct Persona candidate.",
    requestId,
    httpStatus: 422,
    retryable: true,
  });
}
