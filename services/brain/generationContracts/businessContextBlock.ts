import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";

function clip(value: string | null | undefined, max = 400): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "Not recorded";
  }
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function resolveFocusDomainName(bundle: GenerationBundle): string {
  const { domainMemory } = bundle.brainContext;
  const focusId = domainMemory.focusDomainId;
  if (!focusId) {
    return "Not scoped";
  }
  const match = domainMemory.domains.find((domain) => domain.id === focusId);
  return match?.name?.trim() || focusId;
}

function resolveDiscussionExcerpt(input: {
  title?: string | null;
  body?: string | null;
  content?: string | null;
  bundle: GenerationBundle;
}): { title: string; body: string } {
  const focus = input.bundle.brainContext.discussionMemory.focus;
  const title =
    input.title?.trim() ||
    focus?.discussion?.title?.trim() ||
    "Untitled discussion";
  const body =
    input.body?.trim() ||
    input.content?.trim() ||
    focus?.discussion?.body?.trim() ||
    "";

  return { title, body: clip(body, 1800) };
}

export function formatStructuredBusinessContext(input: {
  bundle: GenerationBundle;
  discussion?: {
    title?: string | null;
    body?: string | null;
    content?: string | null;
  };
  analysis?: Record<string, unknown>;
  opportunity?: Record<string, unknown>;
}): string {
  const { bundle } = input;
  const identity = bundle.brainContext.businessMemory.identity;
  const understanding = bundle.executiveUnderstanding;
  const strategy = bundle.executiveStrategy;
  const pipeline = bundle.reasoningPipeline;
  const { title, body } = resolveDiscussionExcerpt({
    ...input.discussion,
    bundle,
  });

  const buyerStage =
    understanding.marketUnderstanding.buyerStage ??
    strategy.buyerStage ??
    String(input.analysis?.buyer_stage ?? "Unknown");

  const painPoints =
    pipeline.evidence.statedPainPoints.slice(0, 5).join("; ") ||
    understanding.marketUnderstanding.painPoints.slice(0, 5).join("; ") ||
    clip(String(input.analysis?.pain_points ?? ""), 300);

  const intent =
    pipeline.evidence.explicitBuyerNeed ??
    String(input.analysis?.intent ?? "Assess from discussion");

  const priorSummary = input.analysis?.summary
    ? clip(String(input.analysis.summary), 400)
    : null;

  const opportunityBlock = input.opportunity
    ? [
        "OPPORTUNITY:",
        `- Title: ${clip(String(input.opportunity.title ?? ""), 200)}`,
        `- Reason: ${clip(String(input.opportunity.reason ?? ""), 400)}`,
      ].join("\n")
    : "";

  return [
    "=== BUSINESS CONTEXT (provided — use directly, do not re-infer) ===",
    "",
    "ORGANIZATION BRAIN:",
    `- Operator: ${identity?.greetingName ?? "Unknown"}`,
    `- About: ${clip(identity?.aboutYou, 350)}`,
    `- Expertise: ${clip(identity?.expertise, 250)}`,
    "",
    "INTELLIGENCE DOMAIN:",
    `- ${resolveFocusDomainName(bundle)}`,
    "",
    "DISCUSSION:",
    `- Title: ${title}`,
    body !== "Not recorded" ? `- Thread: ${body}` : "",
    "",
    "BUYER STAGE:",
    `- ${buyerStage}`,
    "",
    "PAIN POINTS:",
    `- ${painPoints}`,
    "",
    "INTENT:",
    `- ${intent}`,
    "",
    opportunityBlock,
    priorSummary
      ? [
          "",
          "PREVIOUS EXECUTIVE UNDERSTANDING:",
          `- Summary: ${priorSummary}`,
          input.analysis?.recommended_action
            ? `- Recommended action: ${clip(String(input.analysis.recommended_action), 300)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    "",
    "EXECUTIVE RECOMMENDATION:",
    `- ${clip(strategy.primaryObjective, 300)}`,
    `- Approach: ${clip(strategy.recommendedApproach, 200)}`,
    "",
    "CURRENT BUSINESS OBJECTIVE:",
    `- ${clip(strategy.marketingStrategy.businessObjective, 300)}`,
    `- Conversion: ${clip(strategy.marketingStrategy.conversionObjective, 200)}`,
    `- Trust: ${clip(strategy.marketingStrategy.trustObjective, 200)}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
