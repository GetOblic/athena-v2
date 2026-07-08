import { normalizeBriefingStatus } from "@/lib/briefingStatus";
import { normalizeDiscussionLifecycleKey } from "@/lib/discussionStatus";
import { normalizeOpportunityStatus } from "@/lib/opportunityStatus";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import type { DomainMemoryEntry } from "@/services/brain/brainContextTypes";
import type {
  BuyingSignalKnowledgeEntry,
  CompetitorKnowledgeEntry,
  MarketKnowledgeEntry,
  PainPointKnowledgeEntry,
  TerminologyKnowledgeEntry,
} from "@/services/brain/executiveMemoryTypes";
import {
  MAX_EXECUTIVE_MEMORY_COMPETITORS,
  MAX_EXECUTIVE_MEMORY_PAIN_POINTS,
  MAX_EXECUTIVE_MEMORY_SIGNALS,
  MAX_EXECUTIVE_MEMORY_TERMS,
} from "@/services/brain/executiveMemoryTypes";

type FrequencyRecord = {
  count: number;
  lastSeen: string | null;
  confidenceTotal: number;
  confidenceCount: number;
  domainId: string | null;
  domainName: string | null;
};

export function normalizeMemoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function splitMemoryPhrases(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(/[\n;,•|]+/)
    .map((part) => part.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((part) => part.length >= 3);
}

export function splitTerminology(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(/[\n,;|/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

export function averageConfidence(
  total: number,
  count: number,
): number | null {
  if (count === 0) {
    return null;
  }

  return Math.round(total / count);
}

export function incrementFrequency(
  map: Map<string, FrequencyRecord>,
  key: string,
  input: {
    timestamp?: string | null;
    confidence?: number | null;
    domainId?: string | null;
    domainName?: string | null;
  },
) {
  const normalized = normalizeMemoryKey(key);
  if (!normalized) {
    return;
  }

  const existing = map.get(normalized) ?? {
    count: 0,
    lastSeen: null,
    confidenceTotal: 0,
    confidenceCount: 0,
    domainId: input.domainId ?? null,
    domainName: input.domainName ?? null,
  };

  existing.count += 1;

  if (input.timestamp) {
    if (!existing.lastSeen || input.timestamp > existing.lastSeen) {
      existing.lastSeen = input.timestamp;
      if (input.domainId) {
        existing.domainId = input.domainId;
        existing.domainName = input.domainName ?? null;
      }
    }
  }

  if (input.confidence != null && !Number.isNaN(input.confidence)) {
    existing.confidenceTotal += input.confidence;
    existing.confidenceCount += 1;
  }

  map.set(normalized, existing);
}

export function frequencyMapToPainPoints(
  map: Map<string, FrequencyRecord>,
  limit = MAX_EXECUTIVE_MEMORY_PAIN_POINTS,
): PainPointKnowledgeEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([painPoint, record]) => ({
      painPoint,
      occurrences: record.count,
      lastSeen: record.lastSeen,
      primaryDomainId: record.domainId,
      primaryDomainName: record.domainName,
      confidence: averageConfidence(record.confidenceTotal, record.confidenceCount),
    }));
}

export function frequencyMapToSignals(
  map: Map<string, FrequencyRecord>,
  limit = MAX_EXECUTIVE_MEMORY_SIGNALS,
): BuyingSignalKnowledgeEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([signal, record]) => ({
      signal,
      count: record.count,
      lastSeen: record.lastSeen,
      confidence: averageConfidence(record.confidenceTotal, record.confidenceCount),
    }));
}

export function frequencyMapToCompetitors(
  map: Map<string, FrequencyRecord>,
  limit = MAX_EXECUTIVE_MEMORY_COMPETITORS,
): CompetitorKnowledgeEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([name, record]) => ({
      name,
      mentions: record.count,
      lastSeen: record.lastSeen,
      domainId: record.domainId,
      domainName: record.domainName,
    }));
}

export function mergeTerminology(
  map: Map<string, { sources: Set<string>; count: number }>,
  terms: string[],
  source: string,
) {
  for (const term of terms) {
    const normalized = normalizeMemoryKey(term);
    if (!normalized || normalized.length < 2) {
      continue;
    }

    const existing = map.get(normalized) ?? {
      sources: new Set<string>(),
      count: 0,
    };

    existing.sources.add(source);
    existing.count += 1;
    map.set(normalized, existing);
  }
}

export function terminologyMapToEntries(
  map: Map<string, { sources: Set<string>; count: number }>,
  limit = MAX_EXECUTIVE_MEMORY_TERMS,
): TerminologyKnowledgeEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([term, record]) => ({
      term,
      sources: [...record.sources],
      count: record.count,
    }));
}

export function extractBusinessConstraints(
  masterProfile: Record<string, unknown> | null,
): string[] {
  if (!masterProfile) {
    return [];
  }

  const constraints: string[] = [];
  const candidateKeys = [
    "constraints",
    "business_constraints",
    "rules",
    "professional_rules",
    "do_not",
  ];

  for (const key of candidateKeys) {
    const value = masterProfile[key];
    if (typeof value === "string" && value.trim()) {
      constraints.push(...splitMemoryPhrases(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          constraints.push(item.trim());
        }
      }
    }
  }

  return [...new Set(constraints.map((item) => item.trim()).filter(Boolean))];
}

export function extractVoiceFromProfile(
  masterProfile: Record<string, unknown> | null,
  expertise: string | null,
): string | null {
  if (masterProfile) {
    for (const key of ["voice", "brand_voice", "tone"]) {
      const value = masterProfile[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return expertise?.trim() || null;
}

export function collectPainPoints(input: {
  analyses: DiscussionAnalysis[];
  briefings: AthenaReview[];
  domains: DomainMemoryEntry[];
  domainLookup: Map<string, DomainMemoryEntry>;
}): PainPointKnowledgeEntry[] {
  const map = new Map<string, FrequencyRecord>();

  for (const analysis of input.analyses) {
    const domain = analysis.community_id
      ? input.domainLookup.get(analysis.community_id)
      : null;

    for (const phrase of splitMemoryPhrases(analysis.pain_points)) {
      incrementFrequency(map, phrase, {
        timestamp: analysis.created_at,
        confidence: analysis.confidence,
        domainId: domain?.id ?? analysis.community_id,
        domainName: domain?.name ?? null,
      });
    }
  }

  for (const briefing of input.briefings) {
    for (const phrase of splitMemoryPhrases(briefing.pain_points)) {
      incrementFrequency(map, phrase, {
        timestamp: briefing.updated_at,
        confidence: briefing.confidence,
      });
    }
  }

  for (const domain of input.domains) {
    for (const phrase of splitMemoryPhrases(domain.latestIntelligence?.recurring_pain_points)) {
      incrementFrequency(map, phrase, {
        timestamp: domain.latestIntelligence?.created_at ?? null,
        confidence: domain.confidence,
        domainId: domain.id,
        domainName: domain.name,
      });
    }
  }

  return frequencyMapToPainPoints(map);
}

const BUYING_SIGNAL_LABELS: Record<string, string> = {
  none: "no_buying_intent",
  low: "low_buying_intent",
  medium: "moderate_buying_intent",
  high: "high_buying_intent",
  unaware: "buyer_stage_unaware",
  aware: "buyer_stage_aware",
  consideration: "buyer_stage_consideration",
  decision: "buyer_stage_decision",
  high_intent: "buyer_stage_high_intent",
  price_request: "price_request",
  recommendation_request: "recommendation_request",
  appointment_intent: "appointment_intent",
  purchase_intent: "purchase_intent",
  decision_timing: "decision_timing",
};

export function collectBuyingSignals(input: {
  analyses: DiscussionAnalysis[];
  opportunities: Opportunity[];
}): BuyingSignalKnowledgeEntry[] {
  const map = new Map<string, FrequencyRecord>();

  for (const analysis of input.analyses) {
    const timestamp = analysis.created_at;
    const confidence = analysis.confidence;

    if (analysis.intent?.trim()) {
      const label =
        BUYING_SIGNAL_LABELS[normalizeMemoryKey(analysis.intent)] ??
        `intent_${normalizeMemoryKey(analysis.intent)}`;
      incrementFrequency(map, label, { timestamp, confidence });
    }

    if (analysis.buyer_stage?.trim()) {
      const label =
        BUYING_SIGNAL_LABELS[normalizeMemoryKey(analysis.buyer_stage)] ??
        `buyer_stage_${normalizeMemoryKey(analysis.buyer_stage)}`;
      incrementFrequency(map, label, { timestamp, confidence });
    }

    if (analysis.opportunity_detected) {
      incrementFrequency(map, "opportunity_detected", { timestamp, confidence });
    }

    const rawSignals = analysis.raw_json?.buying_signals;
    if (Array.isArray(rawSignals)) {
      for (const signal of rawSignals) {
        if (typeof signal === "string" && signal.trim()) {
          incrementFrequency(map, signal.trim(), { timestamp, confidence });
        }
      }
    }
  }

  for (const opportunity of input.opportunities) {
    const timestamp = opportunity.updated_at;
    const confidence = opportunity.score;

    if (opportunity.urgency?.trim()) {
      incrementFrequency(map, `urgency_${normalizeMemoryKey(opportunity.urgency)}`, {
        timestamp,
        confidence,
      });
    }

    if (opportunity.intent?.trim()) {
      incrementFrequency(map, `intent_${normalizeMemoryKey(opportunity.intent)}`, {
        timestamp,
        confidence,
      });
    }

    const recommended = opportunity.recommended_action?.toLowerCase() ?? "";
    if (recommended.includes("price")) {
      incrementFrequency(map, "price_request", { timestamp, confidence });
    }
    if (recommended.includes("recommend")) {
      incrementFrequency(map, "recommendation_request", { timestamp, confidence });
    }
    if (recommended.includes("appointment") || recommended.includes("call")) {
      incrementFrequency(map, "appointment_intent", { timestamp, confidence });
    }
    if (recommended.includes("purchase") || recommended.includes("buy")) {
      incrementFrequency(map, "purchase_intent", { timestamp, confidence });
    }
    if (recommended.includes("timing") || recommended.includes("when")) {
      incrementFrequency(map, "decision_timing", { timestamp, confidence });
    }
  }

  return frequencyMapToSignals(map);
}

export function collectTerminology(input: {
  domains: DomainMemoryEntry[];
  discussions: Discussion[];
  knowledgeTags: string[];
  masterProfile: Record<string, unknown> | null;
  expertise: string | null;
}): TerminologyKnowledgeEntry[] {
  const map = new Map<string, { sources: Set<string>; count: number }>();

  for (const domain of input.domains) {
    mergeTerminology(map, domain.terminology, `domain:${domain.name}`);
    const rawTerminology = domain.latestIntelligence?.raw_json?.terminology;
    if (typeof rawTerminology === "string") {
      mergeTerminology(
        map,
        splitTerminology(rawTerminology),
        `domain_intelligence:${domain.name}`,
      );
    }
  }

  for (const tag of input.knowledgeTags) {
    mergeTerminology(map, [tag], "knowledge_asset");
  }

  if (input.expertise?.trim()) {
    mergeTerminology(map, splitTerminology(input.expertise), "business_profile");
  }

  if (input.masterProfile) {
    for (const key of ["terminology", "methodology", "keywords"]) {
      const value = input.masterProfile[key];
      if (typeof value === "string") {
        mergeTerminology(map, splitTerminology(value), "master_profile");
      }
    }
  }

  for (const discussion of input.discussions) {
    if (discussion.title?.trim()) {
      mergeTerminology(map, splitTerminology(discussion.title), "discussion");
    }
  }

  return terminologyMapToEntries(map);
}

export function collectCompetitors(
  domains: DomainMemoryEntry[],
): CompetitorKnowledgeEntry[] {
  const map = new Map<string, FrequencyRecord>();

  for (const domain of domains) {
    for (const competitor of domain.competitors) {
      incrementFrequency(map, competitor, {
        timestamp: domain.latestIntelligence?.created_at ?? null,
        confidence: domain.confidence,
        domainId: domain.id,
        domainName: domain.name,
      });
    }

    const rawCompetitors = domain.latestIntelligence?.raw_json?.competitors_alternatives;
    if (typeof rawCompetitors === "string") {
      for (const name of splitMemoryPhrases(rawCompetitors)) {
        incrementFrequency(map, name, {
          timestamp: domain.latestIntelligence?.created_at ?? null,
          confidence: domain.confidence,
          domainId: domain.id,
          domainName: domain.name,
        });
      }
    }
  }

  return frequencyMapToCompetitors(map);
}

export function buildBuyerStageDistribution(input: {
  analyses: DiscussionAnalysis[];
  briefings: AthenaReview[];
}): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const analysis of input.analyses) {
    const stage = analysis.buyer_stage?.trim() || "unknown";
    distribution[stage] = (distribution[stage] ?? 0) + 1;
  }

  for (const briefing of input.briefings) {
    const stage = briefing.buyer_stage?.trim() || "unknown";
    distribution[stage] = (distribution[stage] ?? 0) + 1;
  }

  return distribution;
}

export function topDistributionKeys(
  distribution: Record<string, number>,
  limit = 5,
): Array<{ key: string; count: number }> {
  return Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function buildDiscussionOutcomeDistribution(
  discussions: Discussion[],
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const discussion of discussions) {
    const key = normalizeDiscussionLifecycleKey(discussion.status) ?? "unknown";
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  return distribution;
}

export function buildOpportunityStatusDistribution(
  opportunities: Opportunity[],
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const opportunity of opportunities) {
    const key = normalizeOpportunityStatus(opportunity.status);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  return distribution;
}

export function buildBriefingDecisionCounts(briefings: AthenaReview[]) {
  const counts = {
    approved: 0,
    needsRevision: 0,
    rejected: 0,
    draft: 0,
  };

  for (const briefing of briefings) {
    const key = normalizeBriefingStatus(briefing.status);
    if (key === "approved") counts.approved += 1;
    if (key === "needs_revision") counts.needsRevision += 1;
    if (key === "rejected") counts.rejected += 1;
    if (key === "draft") counts.draft += 1;
  }

  return counts;
}

export function mostCommonValue(
  distribution: Record<string, number>,
): string | null {
  const sorted = topDistributionKeys(distribution, 1);
  return sorted[0]?.key ?? null;
}

export function buildDomainDiscussionCounts(
  discussions: Discussion[],
  analyzedIds: Set<string>,
  domains: DomainMemoryEntry[],
): MarketKnowledgeEntry[] {
  const counts = new Map<string, { total: number; analyzed: number }>();

  for (const discussion of discussions) {
    if (!discussion.community_id) {
      continue;
    }

    const existing = counts.get(discussion.community_id) ?? {
      total: 0,
      analyzed: 0,
    };
    existing.total += 1;
    if (analyzedIds.has(discussion.id)) {
      existing.analyzed += 1;
    }
    counts.set(discussion.community_id, existing);
  }

  return domains.map((domain) => {
    const domainCounts = counts.get(domain.id) ?? { total: 0, analyzed: 0 };
    return {
      domainId: domain.id,
      domainName: domain.name,
      market: domain.market,
      discussionCount: domainCounts.total,
      analyzedDiscussionCount: domainCounts.analyzed,
      confidence: domain.confidence,
      isActive: domain.isActive,
    };
  });
}

export function emptyExecutiveMemorySections(): Pick<
  import("@/services/brain/executiveMemoryTypes").ExecutiveMemory,
  | "businessKnowledge"
  | "marketKnowledge"
  | "audienceKnowledge"
  | "terminologyKnowledge"
  | "competitorKnowledge"
  | "painPointKnowledge"
  | "buyingSignalKnowledge"
  | "decisionKnowledge"
  | "contentKnowledge"
  | "patternKnowledge"
  | "performanceKnowledge"
> {
  return {
    businessKnowledge: {
      description: null,
      voice: null,
      expertise: null,
      website: null,
      businessKnowledge: null,
      masterProfile: null,
      masterProfileVersion: null,
      homepageLearning: null,
      businessConstraints: [],
      missingFields: [
        "about_you",
        "expertise",
        "website",
        "master_profile",
        "brain_status",
      ],
      completenessScore: 0,
      isBrainTrained: false,
    },
    marketKnowledge: {
      topMarkets: [],
      mostActiveDomains: [],
      domainCoverage: 0,
      knowledgeGrowthDelta: null,
      recentActivityCount: 0,
      totalDomains: 0,
    },
    audienceKnowledge: {
      buyerStageDistribution: {},
      topBuyerStages: [],
    },
    terminologyKnowledge: [],
    competitorKnowledge: [],
    painPointKnowledge: [],
    buyingSignalKnowledge: [],
    decisionKnowledge: {
      briefingsApproved: 0,
      briefingsNeedsRevision: 0,
      briefingsRejected: 0,
      briefingsDraft: 0,
      opportunityStatusDistribution: {},
      discussionOutcomeDistribution: {},
      refreshIndicators: {
        staleDiscussions: 0,
        analysesConsidered: 0,
      },
    },
    contentKnowledge: {
      deploymentAssetCount: 0,
      blueprintCount: 0,
      blueprintWithPromptsCount: 0,
      knowledgeAssetCount: 0,
      approvedBriefingAssetCount: 0,
      latestBlueprintAt: null,
      latestKnowledgeAssetAt: null,
      averageEstimatedReuse: null,
      assetTypeCoverage: [],
    },
    patternKnowledge: {
      mostCommonBuyerStage: null,
      mostCommonObjection: null,
      mostCommonOpportunityReason: null,
      mostCommonRecommendation: null,
      mostCommonDeploymentType: null,
      mostActiveDomainId: null,
      mostActiveDomainName: null,
      highestOpportunityCategory: null,
    },
    performanceKnowledge: {
      averageOpportunityScore: null,
      averageBriefingConfidence: null,
      averageAnalysisConfidence: null,
      knowledgeConfidence: null,
      knowledgeConfidenceDelta: null,
    },
  };
}
