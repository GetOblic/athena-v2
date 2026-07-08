import type { BusinessDecision } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

export const SIMPLIFIED_QUALITY_MAX_PASSES = 2;

const GENERIC_CLAIM_PATTERNS = [
  /\bcreate a webinar\b/i,
  /\bcomprehensive guide\b/i,
  /\bthought leadership\b/i,
  /\bbest practices\b/i,
  /\bwe are experts\b/i,
];

export function validateArtifactOutput(input: {
  text: string;
  requiredFields?: string[];
  businessDecision?: BusinessDecision;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const text = input.text.trim();

  if (!text) {
    errors.push("Output is empty.");
    return { valid: false, errors };
  }

  if (input.requiredFields?.length) {
    for (const field of input.requiredFields) {
      if (!text.toLowerCase().includes(field.toLowerCase())) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (input.businessDecision) {
    const decisionToken = input.businessDecision.decision.replace(/_/g, " ");
    if (
      !text.toLowerCase().includes(decisionToken.slice(0, 12)) &&
      !text.toLowerCase().includes(input.businessDecision.recommendedAssetType.replace(/_/g, " "))
    ) {
      errors.push("Output does not reflect the selected Business Decision.");
    }
  }

  if (GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) {
    errors.push("Output contains unsupported generic claims.");
  }

  return { valid: errors.length === 0, errors };
}

export async function runSimplifiedQualityGateLoop<T>(input: {
  generate: (refinementSuffix: string) => Promise<string>;
  parse: (raw: string) => T;
  validate: (parsed: T, raw: string) => { valid: boolean; errors: string[] };
  toReviewText: (parsed: T) => string;
}): Promise<{ parsed: T; raw: string }> {
  const attempts: Array<{ parsed: T; raw: string; score: number }> = [];
  let refinementSuffix = "";

  for (let pass = 0; pass < SIMPLIFIED_QUALITY_MAX_PASSES; pass += 1) {
    let raw: string;
    try {
      raw = await input.generate(refinementSuffix);
    } catch (error) {
      console.error(`Simplified quality gate generation failed (pass ${pass}):`, error);
      refinementSuffix =
        "CRITICAL: Respond with valid JSON only. Previous generation failed.";
      continue;
    }

    let parsed: T;
    try {
      parsed = input.parse(raw);
    } catch (error) {
      console.error(`Simplified quality gate parse failed (pass ${pass}):`, error);
      refinementSuffix =
        "CRITICAL: Respond with valid JSON only. No markdown fences. No prose outside JSON.";
      continue;
    }

    const reviewText = input.toReviewText(parsed);
    const validation = input.validate(parsed, reviewText);
    const score = validation.valid ? 10 : Math.max(1, 10 - validation.errors.length * 2);
    attempts.push({ parsed, raw, score });

    if (validation.valid) {
      return { parsed, raw };
    }

    refinementSuffix = [
      "QUALITY REVIEW REJECTED:",
      ...validation.errors.map((error) => `- ${error}`),
      "Regenerate and satisfy all requirements.",
    ].join("\n");
  }

  if (attempts.length === 0) {
    throw new Error("Simplified quality gate produced no valid generations");
  }

  const best = attempts.reduce((top, attempt) =>
    attempt.score > top.score ? attempt : top,
  );

  return { parsed: best.parsed, raw: best.raw };
}
