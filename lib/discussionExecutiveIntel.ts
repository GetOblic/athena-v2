import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";

export type AthenaVerdict = "Worth pursuing" | "Monitor" | "Low priority";

export type ResponseTiming = "Respond within 12 hours" | "Respond today" | "Monitor";

export function getAthenaVerdict(
  analysis: DiscussionAnalysis,
): AthenaVerdict {
  const confidence = analysis.confidence ?? 0;

  if (analysis.opportunity_detected && confidence >= 65) {
    return "Worth pursuing";
  }

  if (analysis.opportunity_detected || confidence >= 45) {
    return "Monitor";
  }

  return "Low priority";
}

export function getResponseTiming(
  analysis: DiscussionAnalysis,
): ResponseTiming {
  const confidence = analysis.confidence ?? 0;
  const intent = (analysis.intent ?? "").toLowerCase();
  const highIntent = intent === "high" || intent === "medium";

  if (confidence >= 70 && highIntent) {
    return "Respond within 12 hours";
  }

  if (confidence >= 45 || intent === "medium" || intent === "high") {
    return "Respond today";
  }

  return "Monitor";
}

export function buildWhyAthenaBullets(
  analysis: DiscussionAnalysis,
): string[] {
  const bullets: string[] = [];

  if (analysis.buyer_stage?.trim()) {
    bullets.push(`Buyer stage: ${analysis.buyer_stage}`);
  }

  if (analysis.pain_points?.trim()) {
    bullets.push(`Primary concern: ${analysis.pain_points.trim()}`);
  }

  if (analysis.opportunity_reason?.trim()) {
    bullets.push(`Opportunity signal: ${analysis.opportunity_reason.trim()}`);
  }

  if (analysis.risk_level?.trim()) {
    bullets.push(`Risk level: ${analysis.risk_level}`);
  }

  if (analysis.confidence != null) {
    bullets.push(`Athena confidence: ${analysis.confidence}%`);
  }

  return bullets.slice(0, 5);
}
