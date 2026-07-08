import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type { EvidenceExtraction } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

const OBJECTION_PATTERNS = [
  /\btoo expensive\b/i,
  /\bnot sure\b/i,
  /\bconcerned\b/i,
  /\bworried\b/i,
  /\bdon't trust\b/i,
  /\bscam\b/i,
  /\bcompared to\b/i,
];

const URGENCY_PATTERNS = [
  /\basap\b/i,
  /\burgent\b/i,
  /\bdeadline\b/i,
  /\bneed this now\b/i,
  /\bstarting soon\b/i,
  /\bthis week\b/i,
];

const INTENT_PATTERNS = [
  /\blooking for\b/i,
  /\bneed help\b/i,
  /\brecommend\b/i,
  /\bwhich (one|option)\b/i,
  /\bhow do i\b/i,
  /\bshould i\b/i,
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function matchPatterns(text: string, patterns: RegExp[]): string[] {
  return uniqueStrings(
    splitSentences(text).filter((sentence) =>
      patterns.some((pattern) => pattern.test(sentence)),
    ),
  );
}

function extractQuotedSnippets(text: string, limit = 6): string[] {
  return uniqueStrings(splitSentences(text)).slice(0, limit);
}

export function buildEvidenceExtraction(
  brainContext: AthenaBrainContext,
  discussionText?: string,
): EvidenceExtraction {
  const focus = brainContext.discussionMemory.focus;
  const discussionBody =
    discussionText?.trim() ||
    focus?.discussion?.body?.trim() ||
    focus?.threadUpdates.map((update) => update.body).join("\n") ||
    "";
  const analysis = focus?.latestAnalysis;

  const painPoints = uniqueStrings([
    ...(analysis?.pain_points
      ? analysis.pain_points.split(/[,;\n]+/).map((entry) => entry.trim())
      : []),
    ...matchPatterns(discussionBody, [/pain|struggle|frustrated|stuck|confused/i]),
  ]);

  const objections = matchPatterns(discussionBody, OBJECTION_PATTERNS);
  const urgencySignals = matchPatterns(discussionBody, URGENCY_PATTERNS);
  const intentSignals = matchPatterns(discussionBody, INTENT_PATTERNS);

  const explicitBuyerNeed =
    analysis?.intent?.trim() ||
    intentSignals[0] ||
    (painPoints[0] ? `Address: ${painPoints[0]}` : null);

  const buyingIntent =
    analysis?.buyer_stage?.trim() ||
    (intentSignals.length > 0 ? "active_evaluation" : null);

  const decisionCriteria = uniqueStrings([
    ...matchPatterns(discussionBody, [/criteria|compare|versus|vs\.|better than/i]),
    ...(analysis?.recommended_action
      ? [analysis.recommended_action]
      : []),
  ]);

  const constraints = matchPatterns(discussionBody, [
    /budget|timeline|limited|can't|cannot|must have/i,
  ]);

  const requestedSolution = matchPatterns(discussionBody, [
    /looking for|need a|want a|recommend a/i,
  ])[0] ?? null;

  const missingInformation: string[] = [];
  if (!painPoints.length) missingInformation.push("No explicit pain points stated.");
  if (!buyingIntent) missingInformation.push("Buying intent unclear.");
  if (!discussionBody) missingInformation.push("Discussion thread text unavailable.");

  const confidenceBase = [
    discussionBody.length > 80,
    painPoints.length > 0,
    Boolean(buyingIntent),
    Boolean(analysis),
    objections.length > 0 || urgencySignals.length > 0,
  ].filter(Boolean).length;

  return {
    explicitBuyerNeed,
    statedPainPoints: painPoints,
    objections,
    urgencySignals,
    buyingIntent,
    decisionCriteria,
    constraints,
    requestedSolution,
    emotionalTone: analysis?.sentiment?.trim() || null,
    quotedEvidenceSnippets: extractQuotedSnippets(discussionBody),
    missingInformation,
    confidence: Math.round((confidenceBase / 5) * 100),
  };
}
