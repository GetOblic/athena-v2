/**
 * Bounded Estimate Ask Athena context composer.
 *
 * Trust classes remain semantically distinct:
 * 1. FROZEN ESTIMATE FACTS
 * 2. FROZEN PROSPECT GENERATION CONTEXT (Prospect-targeted Ready Estimates only)
 * 3. CURRENT ESTIMATE PRICING METHODOLOGY (live-at-turn)
 * 4. CURRENT TRUSTED ATHENA INTELLIGENCE (live-at-turn org context)
 * 5. CONVERSATION HISTORY (assembled by prompt builder)
 * 6. CURRENT USER QUESTION (assembled by prompt builder)
 *
 * Does NOT call composeEstimateOrganizationContext.
 * Does NOT live-reload Prospect intelligence (Prospect identity fetchers, Current
 * EV loaders, Blueprint loaders, Prospect website loaders, Discussion/Opportunity
 * libraries). Frozen Prospect context comes only from
 * athena_estimates.prospect_generation_context_json.
 * SEO/Personas excluded by default for conversation.
 */

import { truncateText } from "@/services/athenaConversation/athenaConversationPromptShared";
import type { AthenaConversationContextSection } from "@/services/athenaConversation/athenaConversationTypes";
import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import {
  formatBrainContextForPrompt,
  type PromptIdentityContext,
} from "@/services/brain/formatBrainContextForPrompt";
import { validateEstimateProspectGenerationContext } from "@/services/estimate/athenaEstimateProspectContext";
import { deriveAthenaEstimateProspectRemoved } from "@/services/estimate/athenaEstimateProspectTarget";
import type { AthenaEstimate } from "@/services/estimate/athenaEstimateTypes";
import { ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS } from "@/services/estimate/athenaEstimateTypes";
import type { ActiveEstimatePricingMethodologyInstruction } from "@/services/estimate/estimatePricingMethodologyInstruction";
import {
  IDENTITY_EXECUTIVE_INTELLIGENCE_KEY,
  readIdentityExecutiveIntelligence,
  type IdentityExecutiveIntelligence,
} from "@/services/identity/identityExecutiveIntelligence";
import { loadOrganizationDeepWebsiteIntelligence } from "@/services/seo/seoContextComposer";
import {
  formatDeepIntelligenceForBrainPrompt,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { ESTIMATE_CONVERSATION_LIMITS } from "@/services/estimateConversation/estimateConversationTypes";

type BuildBrainFn = (organizationId: string) => Promise<BrainEngineContext | null>;
type LoadDeepIntelligenceFn = (
  organizationId: string,
) => Promise<DeepWebsiteIntelligence | null>;

async function defaultBuildBrain(
  organizationId: string,
): Promise<BrainEngineContext | null> {
  const { buildBrainContextForOrganization } = await import(
    "@/services/brain/brainContextBuilder"
  );
  return buildBrainContextForOrganization(organizationId);
}

function clamp(value: string, max: number): string {
  return truncateText(value.trim(), max);
}

function pushSection(
  sections: AthenaConversationContextSection[],
  section: AthenaConversationContextSection,
): void {
  const content = section.content.trim();
  if (!content) return;
  sections.push({ ...section, content });
}

function identityPromptContextFromBrain(
  organizationId: string,
  brain: BrainEngineContext | null,
): PromptIdentityContext {
  const identity = brain?.businessMemory.identity;
  if (!identity) {
    return { userId: null, organizationId, identity: null };
  }
  return {
    userId: null,
    organizationId,
    identity: {
      about_you: identity.aboutYou ?? null,
      expertise: identity.expertise ?? null,
      website: identity.website ?? null,
      master_profile:
        (identity.masterProfile as Record<string, unknown> | null) ?? null,
    },
  };
}

function readExecutiveIntelligence(
  brain: BrainEngineContext | null,
): IdentityExecutiveIntelligence | null {
  const masterProfile = brain?.businessMemory.identity?.masterProfile as
    | Record<string, unknown>
    | null
    | undefined;
  if (!masterProfile) return null;
  return readIdentityExecutiveIntelligence(masterProfile);
}

/**
 * Compact aggregates only — organization summary + asset highlights.
 * Explicitly excludes Prospect/Discussion/Opportunity library dumps.
 */
function formatCompactOrganizationAggregates(
  brain: BrainEngineContext | null,
): string {
  if (!brain) {
    return "No compact organization aggregates were available.";
  }

  const payload = {
    organization: brain.organization,
    contextSummary: brain.contextSummary
      ? truncateText(JSON.stringify(brain.contextSummary), 800)
      : null,
    assetAudiences: (brain.assetMemory?.targetAudiences ?? []).slice(0, 6),
    assetBusinessGoals: (brain.assetMemory?.businessGoals ?? []).slice(0, 6),
  };

  return clamp(
    JSON.stringify(payload, null, 2),
    ESTIMATE_CONVERSATION_LIMITS.maxOrganizationAggregatesChars,
  );
}

function formatExecutiveIntelligenceBlock(
  executive: IdentityExecutiveIntelligence | null,
): string {
  if (!executive) {
    return "No Executive Intelligence was available on Master Profile.";
  }
  return clamp(
    JSON.stringify(
      {
        key: IDENTITY_EXECUTIVE_INTELLIGENCE_KEY,
        executive_summary: executive.executive_summary,
        confidence_level: executive.confidence_level,
        voice_alignment: executive.voice_alignment,
        business_knowledge_coverage: executive.business_knowledge_coverage,
        website_evidence_coverage: executive.website_evidence_coverage,
        confidence_reasons: executive.confidence_reasons.slice(0, 6),
        hidden_signals: executive.hidden_signals.slice(0, 4),
      },
      null,
      2,
    ),
    ESTIMATE_CONVERSATION_LIMITS.maxExecutiveIntelligenceChars,
  );
}

function formatDeepWebsiteHighlights(
  intelligence: DeepWebsiteIntelligence | null,
): string {
  if (!intelligence) {
    return "No Deep Website Intelligence highlights were available.";
  }

  const pages = intelligence.pages.slice(0, 8).map((page) => ({
    url: page.url,
    title: page.title,
    page_type: page.page_type,
    excerpt: truncateText(page.excerpt || "", 120),
  }));

  const formatted = [
    truncateText(formatDeepIntelligenceForBrainPrompt(intelligence), 2_200),
    "",
    "PAGE HIGHLIGHTS (bounded):",
    JSON.stringify(pages, null, 2),
  ].join("\n");

  return clamp(formatted, ESTIMATE_CONVERSATION_LIMITS.maxDeepWebsiteChars);
}

/**
 * Highest-priority frozen facts from the saved Ready Estimate.
 * Never drops recommended price / range / scope / core rationale unless impossible.
 * Prospect identity/status is thin provenance only — never live Prospect names.
 */
export function buildFrozenEstimateFactsBlock(
  estimate: AthenaEstimate,
  options?: { hasFrozenProspectGenerationContext?: boolean },
): string {
  const pkg = estimate.package_json;
  const request = estimate.request_json;
  const prospectBusinessNameSnapshot =
    estimate.prospect_business_name_snapshot?.trim() || null;
  const prospectId = estimate.prospect_id?.trim() || null;
  const hasCommercialTarget = Boolean(prospectBusinessNameSnapshot);
  const prospectRemoved = deriveAthenaEstimateProspectRemoved({
    prospectId,
    prospectBusinessNameSnapshot,
  });
  const hasFrozenProspectGenerationContext = Boolean(
    options?.hasFrozenProspectGenerationContext,
  );

  const core: Record<string, unknown> = {
    trustClass: "FROZEN_ESTIMATE_FACTS",
    note: "Immutable saved Ready Estimate. Conversation must not mutate these values.",
    estimateId: estimate.id,
    status: estimate.status,
    organizationNameSnapshot: estimate.organization_name_snapshot,
    currencyCode: estimate.currency_code,
    geographyLabel: estimate.geography_label ?? pkg?.geographyLabel ?? null,
    currencyResolution:
      estimate.currency_resolution ?? pkg?.currencyResolution ?? null,
    request: {
      projectNeed: request.projectNeed,
      additionalContext: request.additionalContext ?? null,
      timeframe: request.timeframe ?? null,
    },
    recommendedClientPrice: pkg?.recommendedClientPrice ?? null,
    recommendedPriceRange: pkg?.recommendedPriceRange ?? null,
    scopeInterpretation: pkg?.scopeInterpretation ?? null,
    pricingRationale: pkg?.pricingRationale ?? null,
    keyPriceDrivers: pkg?.keyPriceDrivers ?? [],
    suggestedClientPositioning: pkg?.suggestedClientPositioning ?? null,
    risksAndAssumptions: pkg?.risksAndAssumptions ?? [],
    guidanceDisclaimer: pkg?.guidanceDisclaimer ?? null,
    instructionProvenance: {
      configKey:
        estimate.instruction_config_key ??
        pkg?.instructionProvenance?.configKey ??
        null,
      revisionId:
        estimate.instruction_revision_id ??
        pkg?.instructionProvenance?.revisionId ??
        null,
      configured:
        estimate.instruction_configured ||
        Boolean(pkg?.instructionProvenance?.configured),
    },
    marketResearchClaimed: pkg?.marketResearchClaimed ?? false,
    competitorQuotesFabricated: pkg?.competitorQuotesFabricated ?? false,
  };

  if (hasCommercialTarget && prospectBusinessNameSnapshot) {
    core.prospectBusinessNameSnapshot = prospectBusinessNameSnapshot;
    core.prospectId = prospectId;
    core.prospectRemoved = prospectRemoved;
    core.hasFrozenProspectGenerationContext = hasFrozenProspectGenerationContext;
    core.commercialTarget = prospectBusinessNameSnapshot;
    core.prospectTargetStatus = prospectRemoved
      ? "Prospect removed"
      : "Active";
  }

  let serialized = JSON.stringify(core, null, 2);
  const max = ESTIMATE_CONVERSATION_LIMITS.maxFrozenEstimateFactsChars;
  if (serialized.length <= max) {
    return serialized;
  }

  // Prefer trimming longer narrative fields first; keep price/range/scope/rationale.
  const trimmed = {
    ...core,
    keyPriceDrivers: ((core.keyPriceDrivers as string[]) ?? []).slice(0, 6),
    risksAndAssumptions: ((core.risksAndAssumptions as string[]) ?? []).slice(
      0,
      6,
    ),
    suggestedClientPositioning: core.suggestedClientPositioning
      ? truncateText(String(core.suggestedClientPositioning), 1_200)
      : null,
    pricingRationale: core.pricingRationale
      ? truncateText(String(core.pricingRationale), 2_400)
      : null,
    scopeInterpretation: core.scopeInterpretation
      ? truncateText(String(core.scopeInterpretation), 2_400)
      : null,
    request: {
      ...(core.request as Record<string, unknown>),
      additionalContext:
        (core.request as { additionalContext?: string | null })
          .additionalContext
          ? truncateText(
              String(
                (core.request as { additionalContext?: string | null })
                  .additionalContext,
              ),
              800,
            )
          : null,
    },
  };
  serialized = JSON.stringify(trimmed, null, 2);
  return clamp(serialized, max);
}

/**
 * Resolve frozen Prospect generation context from the Estimate row only.
 * Re-validates; returns exact validated composedText (defensively capped);
 * never invents; never live-reloads Prospect libraries.
 */
export function buildFrozenProspectGenerationContextBlock(
  estimate: AthenaEstimate,
): {
  block: string | null;
  included: boolean;
  unavailable: boolean;
  generationTimeBusinessName: string | null;
  capturedAt: string | null;
} {
  const raw = estimate.prospect_generation_context_json;
  if (raw == null) {
    return {
      block: null,
      included: false,
      unavailable: false,
      generationTimeBusinessName: null,
      capturedAt: null,
    };
  }

  try {
    const validated = validateEstimateProspectGenerationContext(raw);
    const composedText =
      validated.composedText.length >
      ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars
        ? clamp(
            validated.composedText,
            ESTIMATE_CONVERSATION_LIMITS.maxFrozenProspectContextChars,
          )
        : validated.composedText;
    return {
      block: composedText,
      included: true,
      unavailable: false,
      generationTimeBusinessName: validated.businessName,
      capturedAt: validated.capturedAt,
    };
  } catch {
    // Fail open for the conversation turn: keep Estimate facts + live org/methodology.
    return {
      block: null,
      included: false,
      unavailable: true,
      generationTimeBusinessName: null,
      capturedAt: null,
    };
  }
}

export function buildCurrentMethodologyBlock(
  methodology: ActiveEstimatePricingMethodologyInstruction,
): string {
  const header = [
    "CURRENT GETOBLIC ESTIMATE PRICING METHODOLOGY",
    "This is advisory commercial doctrine for this conversation turn.",
    "It is NOT client evidence and NOT historical Estimate provenance.",
    `configKey: ${methodology.configKey}`,
    `revisionId: ${methodology.revisionId ?? "null"}`,
    `configured: ${methodology.configured}`,
    "",
  ].join("\n");

  const body = clamp(
    methodology.instructionText.trim(),
    Math.min(
      ESTIMATE_CONVERSATION_LIMITS.maxMethodologyChars,
      ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
    ),
  );

  return clamp(
    `${header}${body}`,
    ESTIMATE_CONVERSATION_LIMITS.maxMethodologyChars + 400,
  );
}

export type EstimateConversationAssembledContext = {
  organizationId: string;
  estimateId: string;
  frozenEstimateFacts: string;
  /** Exact frozen Prospect generation composedText; null when absent/unavailable. */
  frozenProspectGenerationContext: string | null;
  frozenProspectGenerationMeta: {
    generationTimeBusinessName: string | null;
    capturedAt: string | null;
  };
  methodologyBlock: string;
  liveIntelligenceSections: AthenaConversationContextSection[];
  liveIntelligenceCharCount: number;
  missingNotes: string[];
  meta: {
    usedComposeEstimateOrganizationContext: false;
    includedProspectDiscussionOpportunityLibraries: false;
    includedLiveProspectLibraries: false;
    includedFrozenProspectGenerationContext: boolean;
    frozenProspectContextSource: "frozen_estimate_row" | null;
    includedSeoPackages: false;
    includedPersonas: false;
    methodologyRevisionId: string | null;
  };
};

export type ComposeEstimateConversationContextDeps = {
  buildBrain?: BuildBrainFn;
  loadDeepIntelligence?: LoadDeepIntelligenceFn;
};

/**
 * Assemble bounded conversation context AFTER relationship authorization.
 * Live intelligence loaders are read-only organization loaders only.
 * Prospect context is read solely from the Estimate row freeze.
 */
export async function composeEstimateConversationContext(input: {
  estimate: AthenaEstimate;
  methodology: ActiveEstimatePricingMethodologyInstruction;
  deps?: ComposeEstimateConversationContextDeps;
}): Promise<EstimateConversationAssembledContext> {
  const organizationId = input.estimate.organization_id;
  const missingNotes: string[] = [];
  const liveIntelligenceSections: AthenaConversationContextSection[] = [];

  const frozenProspect = buildFrozenProspectGenerationContextBlock(
    input.estimate,
  );
  if (frozenProspect.unavailable) {
    missingNotes.push(
      "Frozen Prospect generation context was unavailable for this Estimate.",
    );
  }
  const frozenEstimateFacts = buildFrozenEstimateFactsBlock(input.estimate, {
    hasFrozenProspectGenerationContext: frozenProspect.included,
  });
  const methodologyBlock = buildCurrentMethodologyBlock(input.methodology);

  const buildBrain = input.deps?.buildBrain ?? defaultBuildBrain;
  const loadDeepIntelligence =
    input.deps?.loadDeepIntelligence ?? loadOrganizationDeepWebsiteIntelligence;

  let brain: BrainEngineContext | null = null;
  try {
    brain = await buildBrain(organizationId);
  } catch (error) {
    console.error("[ATHENA_ESTIMATE_CONVERSATION] brain_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    brain = null;
  }

  if (!brain) {
    missingNotes.push("Brain / identity summary unavailable.");
  }

  const brainBlock = clamp(
    formatBrainContextForPrompt(
      identityPromptContextFromBrain(organizationId, brain),
    ),
    ESTIMATE_CONVERSATION_LIMITS.maxBrainChars,
  );
  pushSection(liveIntelligenceSections, {
    type: "COMPACT_BRAIN_IDENTITY",
    trust: "confirmed_fact",
    label: "CURRENT TRUSTED ATHENA INTELLIGENCE — Compact Brain / Identity",
    content: brainBlock,
  });

  const executive = readExecutiveIntelligence(brain);
  if (!executive) {
    missingNotes.push("Identity Executive Intelligence unavailable.");
  }
  pushSection(liveIntelligenceSections, {
    type: "IDENTITY_EXECUTIVE_INTELLIGENCE",
    trust: "athena_analysis",
    label:
      "CURRENT TRUSTED ATHENA INTELLIGENCE — Identity Executive Intelligence",
    content: formatExecutiveIntelligenceBlock(executive),
  });

  pushSection(liveIntelligenceSections, {
    type: "COMPACT_ORGANIZATION_AGGREGATES",
    trust: "athena_analysis",
    label:
      "CURRENT TRUSTED ATHENA INTELLIGENCE — Compact Organization Aggregates",
    content: formatCompactOrganizationAggregates(brain),
  });

  let deepIntelligence: DeepWebsiteIntelligence | null = null;
  try {
    deepIntelligence = await loadDeepIntelligence(organizationId);
  } catch (error) {
    console.error(
      "[ATHENA_ESTIMATE_CONVERSATION] deep_intelligence_context_failed",
      {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!deepIntelligence) {
    missingNotes.push("Deep Website Intelligence highlights unavailable.");
  }
  pushSection(liveIntelligenceSections, {
    type: "DEEP_WEBSITE_HIGHLIGHTS",
    trust: "untrusted_source_data",
    label:
      "CURRENT TRUSTED ATHENA INTELLIGENCE — Deep Website Highlights (evidence)",
    content: formatDeepWebsiteHighlights(deepIntelligence),
  });

  // Enforce live intelligence total budget (truncate lowest-priority first).
  let liveTotal = liveIntelligenceSections.reduce(
    (sum, section) => sum + section.content.length,
    0,
  );
  const truncateOrder = [
    "DEEP_WEBSITE_HIGHLIGHTS",
    "COMPACT_ORGANIZATION_AGGREGATES",
    "IDENTITY_EXECUTIVE_INTELLIGENCE",
    "COMPACT_BRAIN_IDENTITY",
  ];
  for (const type of truncateOrder) {
    if (liveTotal <= ESTIMATE_CONVERSATION_LIMITS.maxLiveIntelligenceTotalChars) {
      break;
    }
    const index = liveIntelligenceSections.findIndex(
      (section) => section.type === type,
    );
    if (index < 0) continue;
    const overflow =
      liveTotal - ESTIMATE_CONVERSATION_LIMITS.maxLiveIntelligenceTotalChars;
    const current = liveIntelligenceSections[index];
    const keep = Math.max(0, current.content.length - overflow - 40);
    liveIntelligenceSections[index] = {
      ...current,
      content:
        keep > 0
          ? `${current.content.slice(0, keep)}\n\n[truncated]`
          : "",
    };
    liveTotal = liveIntelligenceSections.reduce(
      (sum, section) => sum + section.content.length,
      0,
    );
  }

  return {
    organizationId,
    estimateId: input.estimate.id,
    frozenEstimateFacts,
    frozenProspectGenerationContext: frozenProspect.block,
    frozenProspectGenerationMeta: {
      generationTimeBusinessName: frozenProspect.generationTimeBusinessName,
      capturedAt: frozenProspect.capturedAt,
    },
    methodologyBlock,
    liveIntelligenceSections: liveIntelligenceSections.filter((s) =>
      s.content.trim(),
    ),
    liveIntelligenceCharCount: liveIntelligenceSections.reduce(
      (sum, section) => sum + section.content.length,
      0,
    ),
    missingNotes,
    meta: {
      usedComposeEstimateOrganizationContext: false,
      includedProspectDiscussionOpportunityLibraries: false,
      includedLiveProspectLibraries: false,
      includedFrozenProspectGenerationContext: frozenProspect.included,
      frozenProspectContextSource: frozenProspect.included
        ? "frozen_estimate_row"
        : null,
      includedSeoPackages: false,
      includedPersonas: false,
      methodologyRevisionId: input.methodology.revisionId,
    },
  };
}
