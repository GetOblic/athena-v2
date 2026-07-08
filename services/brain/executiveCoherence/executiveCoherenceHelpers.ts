import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export function formatExecutiveStrategyForPrompt(
  strategy: ExecutiveStrategy,
): string {
  const sections = [
    "EXECUTIVE STRATEGY (SHARED — DO NOT REINTERPRET):",
    "",
    "All deliverables must align with this strategy while communicating differently.",
    "Think once. Communicate differently depending on destination.",
    "",
    `- Primary objective: ${strategy.primaryObjective}`,
    `- Primary audience: ${strategy.primaryAudience}`,
    `- Buyer stage: ${strategy.buyerStage ?? "Unknown"}`,
    `- Communication priority: ${strategy.communicationPriority}`,
    `- Recommended approach: ${strategy.recommendedApproach}`,
    `- Relationship strategy: ${strategy.relationshipStrategy}`,
    `- Confidence: ${strategy.confidence}`,
    "",
    "SUPPORTING EVIDENCE:",
    ...(strategy.supportingEvidence.length
      ? strategy.supportingEvidence.map((entry) => `- ${entry}`)
      : ["- Current discussion and business identity"]),
    "",
    "REASONING SUMMARY:",
    strategy.reasoningSummary || "No additional reasoning summary.",
    "",
    "INSTRUCTIONS:",
    "Align with this strategy. Do not regenerate or contradict it.",
    "Your output must express this strategy through your deliverable's specialized responsibility.",
  ];

  return sections.join("\n").trim();
}

export function validateSharedExecutiveStrategy(
  strategies: ExecutiveStrategy[],
): { consistent: boolean; errors: string[] } {
  const errors: string[] = [];

  if (strategies.length <= 1) {
    return { consistent: true, errors };
  }

  const [first, ...rest] = strategies;
  for (const other of rest) {
    if (first.metadata.organizationId !== other.metadata.organizationId) {
      errors.push("Executive Strategy organization mismatch.");
    }
    if (first.metadata.strategyFingerprint !== other.metadata.strategyFingerprint) {
      errors.push("Executive Strategy fingerprint mismatch across workflows.");
    }
    if (first.recommendedApproach !== other.recommendedApproach) {
      errors.push("Recommended approach drift across workflows.");
    }
  }

  return { consistent: errors.length === 0, errors };
}
