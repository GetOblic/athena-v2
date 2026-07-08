import { getOutputResponsibility } from "@/services/brain/executiveCoherence/outputResponsibilityContracts";
import type {
  ExecutiveStrategy,
  OutputArtifactType,
  OutputDiversityIssue,
  OutputDiversityValidationResult,
  StrategyAlignmentValidationResult,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

const DEPLOYMENT_MARKERS = [
  "COMMUNITY_REPLY:",
  "PRIVATE_MESSAGE:",
  "SOCIAL_POST:",
  "FOLLOW_UP:",
  "CALL_TO_ACTION:",
];

const EXECUTIVE_REASONING_MARKERS = [
  "executive reasoning",
  "priority assessment",
  "strategic assessment",
  "reasoning summary",
  "executive strategy",
  "recommended approach:",
];

const BLUEPRINT_MARKERS = [
  "production specifications",
  "section hierarchy",
  "slide breakdown",
  "layout expectations",
  "messaging architecture",
  "asset blueprint",
];

const ANALYSIS_MARKERS = [
  "opportunity_detected",
  "buyer_stage",
  "sentiment",
  "what users are saying",
  "discussion analysis",
];

const OVERLAP_THRESHOLD = 0.72;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3),
  );
}

function overlapRatio(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.min(tokensA.size, tokensB.size);
}

function containsAnyMarker(text: string, markers: string[]): string | null {
  const normalized = normalizeText(text);
  for (const marker of markers) {
    if (normalized.includes(marker.toLowerCase())) {
      return marker;
    }
  }
  return null;
}

function isForbiddenPair(a: OutputArtifactType, b: OutputArtifactType): boolean {
  const responsibilityA = getOutputResponsibility(a);
  return responsibilityA.forbiddenOverlapWith.includes(b);
}

export function validateOutputDiversity(input: {
  outputs: Array<{ type: OutputArtifactType; text: string }>;
}): OutputDiversityValidationResult {
  const issues: OutputDiversityIssue[] = [];

  for (let i = 0; i < input.outputs.length; i += 1) {
    for (let j = i + 1; j < input.outputs.length; j += 1) {
      const a = input.outputs[i];
      const b = input.outputs[j];
      const ratio = overlapRatio(a.text, b.text);

      if (ratio >= OVERLAP_THRESHOLD) {
        issues.push({
          artifactA: a.type,
          artifactB: b.type,
          reason: `Substantial wording overlap detected (${Math.round(ratio * 100)}%).`,
          severity: "error",
        });
      } else if (
        isForbiddenPair(a.type, b.type) &&
        ratio >= OVERLAP_THRESHOLD * 0.75
      ) {
        issues.push({
          artifactA: a.type,
          artifactB: b.type,
          reason: `Forbidden deliverable pair shows elevated similarity (${Math.round(ratio * 100)}%).`,
          severity: "warning",
        });
      }
    }
  }

  for (const output of input.outputs) {
    const responsibility = getOutputResponsibility(output.type);
    const normalized = normalizeText(output.text);

    if (
      output.type === "discussion_analysis" &&
      responsibility.verb === "Understand"
    ) {
      const marker = containsAnyMarker(output.text, DEPLOYMENT_MARKERS);
      if (marker && !normalized.includes("suggested_cta")) {
        issues.push({
          artifactA: output.type,
          artifactB: "deployment_asset",
          reason: `Discussion analysis contains deployment marker "${marker}" outside deployment fields.`,
          severity: "warning",
        });
      }
    }

    if (output.type === "deployment_asset") {
      const marker = containsAnyMarker(output.text, EXECUTIVE_REASONING_MARKERS);
      if (marker) {
        issues.push({
          artifactA: output.type,
          artifactB: "executive_briefing",
          reason: `Deployment asset contains executive reasoning marker "${marker}".`,
          severity: "error",
        });
      }
    }

    if (output.type === "executive_briefing") {
      const marker = containsAnyMarker(output.text, BLUEPRINT_MARKERS);
      if (marker) {
        issues.push({
          artifactA: output.type,
          artifactB: "strategic_blueprint",
          reason: `Executive briefing resembles blueprint specification ("${marker}").`,
          severity: "warning",
        });
      }
    }

    if (output.type === "strategic_blueprint") {
      const marker = containsAnyMarker(output.text, ANALYSIS_MARKERS);
      if (marker && !normalized.includes("buyer_stage")) {
        issues.push({
          artifactA: output.type,
          artifactB: "discussion_analysis",
          reason: `Blueprint resembles discussion analysis ("${marker}").`,
          severity: "warning",
        });
      }
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function validateStrategyAlignment(input: {
  strategy: ExecutiveStrategy;
  workflowType: OutputArtifactType;
  outputText: string;
}): StrategyAlignmentValidationResult {
  const issues: string[] = [];
  const approach = input.strategy.recommendedApproach.toLowerCase();
  const normalized = normalizeText(input.outputText);

  if (approach === "educational" && normalized.includes("buy now")) {
    issues.push("Output contradicts educational strategy with hard-sell language.");
  }

  if (approach === "monitor" && normalized.includes("immediate action required")) {
    issues.push("Output contradicts monitor strategy with urgency language.");
  }

  if (
    input.workflowType === "deployment_asset" &&
    containsAnyMarker(input.outputText, EXECUTIVE_REASONING_MARKERS)
  ) {
    issues.push("Deployment output contains executive reasoning.");
  }

  if (
    input.workflowType === "discussion_analysis" &&
    containsAnyMarker(input.outputText, BLUEPRINT_MARKERS)
  ) {
    issues.push("Discussion analysis contains blueprint design language.");
  }

  return {
    aligned: issues.length === 0,
    issues,
  };
}

export function extractDeploymentFields(text: string): string {
  const sections: string[] = [];
  for (const marker of DEPLOYMENT_MARKERS) {
    const index = text.indexOf(marker);
    if (index >= 0) {
      sections.push(text.slice(index, index + 500));
    }
  }
  return sections.join("\n");
}

export function extractAdvisoryFields(parsed: Record<string, unknown>): string {
  return [
    parsed.summary,
    parsed.pain_points,
    parsed.buyer_stage,
    parsed.recommended_action,
    parsed.opportunity_reason,
  ]
    .map((value) => String(value ?? ""))
    .join("\n");
}
