/**
 * Persona Portfolio Coverage Planner — pre-generation portfolio analysis.
 * Non-persistent. Contained inside Persona Generation only.
 */

import {
  buildPersonaCoveragePlannerPrompt,
  PERSONA_COVERAGE_PLANNER_PROMPT_VERSION,
} from "@/services/ai/prompts/personaCoveragePlannerPrompt";
import { generateReview } from "@/services/aiService";
import { normalizeOptionalText } from "@/services/personas/personaUtils";
import type { Persona } from "@/services/personas/personaService";

export { PERSONA_COVERAGE_PLANNER_PROMPT_VERSION };

/** Compact per-field truncation for full-portfolio inventory lines. */
export const PERSONA_COVERAGE_PLANNER_FIELD_TRUNCATE = 120;

/** Total character budget for the complete portfolio prompt block. */
export const PERSONA_COVERAGE_PLANNER_PORTFOLIO_MAX_CHARS = 12_000;

/** Operator-facing explanation length cap. */
export const PERSONA_COVERAGE_PLANNER_EXPLANATION_MAX_CHARS = 480;

/** Generation-guidance length cap for the downstream Persona prompt. */
export const PERSONA_COVERAGE_PLANNER_GUIDANCE_MAX_CHARS = 1_200;

/** Internal planning summary length cap. */
export const PERSONA_COVERAGE_PLANNER_SUMMARY_MAX_CHARS = 1_200;

const PORTFOLIO_LINE_FIELDS = [
  "persona_name",
  "category",
  "occupation",
  "seniority",
  "industry_context",
  "short_description",
  "location_summary",
  "country",
  "goals",
  "motivations",
  "purchase_behavior",
  "preferred_channels",
] as const;

export type PersonaPortfolioCoveragePlan = {
  planningSummary: string;
  generationGuidance: string;
  /** Operator-facing non-persistent rationale shown during review. */
  explanation: string;
  promptVersion: string;
};

export type PlanPersonaPortfolioCoverageDeps = {
  generateReview?: typeof generateReview;
};

const FALLBACK_PLAN: Omit<PersonaPortfolioCoveragePlan, "promptVersion"> = {
  planningSummary:
    "Portfolio coverage planning was unavailable. Proceed with a commercially relevant Persona that expands strategic coverage relative to existing Personas.",
  generationGuidance:
    "Generate one commercially relevant Persona that strengthens portfolio completeness. Prefer an underserved audience, buyer journey, decision-maker role, company size, industry, maturity level, or acquisition channel grounded in Athena Brain — not a superficial variant of an existing Persona.",
  explanation:
    "Athena selected this Persona to strengthen portfolio coverage based on Athena Brain and your existing Personas.",
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

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function sanitizePlanText(
  value: unknown,
  maxChars: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  return truncateText(normalized, maxChars);
}

/**
 * Compact inventory of every organization Persona for planner reasoning.
 * Uses short one-line summaries so the full portfolio can fit a prompt budget.
 */
export function formatPersonaPortfolioForCoveragePlanner(
  personas: Persona[],
): string {
  if (personas.length === 0) {
    return "No existing Personas for this organization.";
  }

  const lines: string[] = [
    `Total Personas in portfolio: ${personas.length}`,
    "",
  ];

  let omitted = 0;

  for (let index = 0; index < personas.length; index += 1) {
    const persona = personas[index];
    const parts: string[] = [];

    for (const field of PORTFOLIO_LINE_FIELDS) {
      const value = normalizeOptionalText(persona[field]);
      if (!value) continue;
      parts.push(
        `${field}=${truncateText(value, PERSONA_COVERAGE_PLANNER_FIELD_TRUNCATE)}`,
      );
    }

    const line = `Persona ${index + 1}: ${
      parts.join(" | ") || "(minimal fields)"
    }`;

    const candidate = [...lines, line].join("\n");
    if (candidate.length > PERSONA_COVERAGE_PLANNER_PORTFOLIO_MAX_CHARS) {
      omitted = personas.length - index;
      break;
    }

    lines.push(line);
  }

  if (omitted > 0) {
    lines.push(
      "",
      `…and ${omitted} additional Persona${omitted === 1 ? "" : "s"} omitted from detail due to prompt budget. Treat them as present when judging concentration.`,
    );
  }

  return clampBlock(
    lines.join("\n"),
    PERSONA_COVERAGE_PLANNER_PORTFOLIO_MAX_CHARS,
  );
}

export function parsePersonaPortfolioCoveragePlan(
  rawText: string,
): PersonaPortfolioCoveragePlan | null {
  const cleaned = stripJsonFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const planningSummary = sanitizePlanText(
    record.planningSummary,
    PERSONA_COVERAGE_PLANNER_SUMMARY_MAX_CHARS,
  );
  const generationGuidance = sanitizePlanText(
    record.generationGuidance,
    PERSONA_COVERAGE_PLANNER_GUIDANCE_MAX_CHARS,
  );
  const explanation = sanitizePlanText(
    record.explanation,
    PERSONA_COVERAGE_PLANNER_EXPLANATION_MAX_CHARS,
  );

  if (!planningSummary || !generationGuidance || !explanation) {
    return null;
  }

  return {
    planningSummary,
    generationGuidance,
    explanation,
    promptVersion: PERSONA_COVERAGE_PLANNER_PROMPT_VERSION,
  };
}

export function buildFallbackPersonaPortfolioCoveragePlan(): PersonaPortfolioCoveragePlan {
  return {
    ...FALLBACK_PLAN,
    promptVersion: PERSONA_COVERAGE_PLANNER_PROMPT_VERSION,
  };
}

/**
 * Analyze the organization's complete Persona portfolio and produce
 * generation guidance plus a non-persistent operator explanation.
 *
 * Failures degrade to a safe fallback — generation must still proceed.
 */
export async function planPersonaPortfolioCoverage(input: {
  brainContextBlock: string;
  personas: Persona[];
  instruction?: string | null;
  requestId: string;
  deps?: PlanPersonaPortfolioCoverageDeps;
}): Promise<PersonaPortfolioCoveragePlan> {
  const generate = input.deps?.generateReview ?? generateReview;
  const portfolioBlock = formatPersonaPortfolioForCoveragePlanner(
    input.personas,
  );
  const prompt = buildPersonaCoveragePlannerPrompt({
    brainContextBlock: input.brainContextBlock,
    portfolioBlock,
    instruction: input.instruction ?? null,
  });

  try {
    const raw = await generate(prompt, {
      generationKind: "generic_review",
      reasoningProfile: "BALANCED",
      systemPrompt:
        "You are Athena's Persona Portfolio Coverage Planner. Reason over the full Persona portfolio and return strict JSON that identifies the coverage gap a new Persona should fill. Optimize for portfolio completeness, not novelty alone.",
      regenerationRunId: `${input.requestId}:coverage-plan`,
      stage: "persona_coverage_planner",
      promptSource: "services/ai/prompts/personaCoveragePlannerPrompt.ts",
    });

    return (
      parsePersonaPortfolioCoveragePlan(raw) ??
      buildFallbackPersonaPortfolioCoveragePlan()
    );
  } catch {
    return buildFallbackPersonaPortfolioCoveragePlan();
  }
}
