/**
 * Deterministic Social Calendar package + weekly-strategy validation (L4).
 * Intra-week only — no historical Social Planner memory.
 */

import { opportunityAppliesToGeography } from "@/services/socialPlanner/calendar/socialCalendarOpportunities";
import {
  SOCIAL_CALENDAR_DAY_NAMES,
  SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES,
  SOCIAL_CALENDAR_OPPORTUNITY_SCOPES,
  type SocialCalendarContext,
  type SocialCalendarDayName,
  type SocialCalendarOpportunity,
} from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_ASSET_TYPE_FAMILY,
  SOCIAL_PLANNER_ASSET_TYPES,
  SOCIAL_PLANNER_AUTHORITY_OBJECTIVES,
  SOCIAL_PLANNER_CONTENT_ARCHETYPES,
  SOCIAL_PLANNER_DIVERSITY_DEFAULTS,
  SOCIAL_PLANNER_DIVERSITY_GUIDED,
  SOCIAL_PLANNER_ENGAGEMENT_TYPES,
  SOCIAL_PLANNER_FAMILY_PRODUCTION_KIND,
  SOCIAL_PLANNER_HOLIDAY_ANCHOR_CATEGORIES,
  SOCIAL_PLANNER_OBJECTIVES,
  SOCIAL_PLANNER_PACKAGE_LIMITS,
  SOCIAL_PLANNER_PLATFORMS,
  SOCIAL_PLANNER_PROMOTIONAL_OBJECTIVES,
  SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES,
  type SocialCalendarAssetV1,
  type SocialCalendarPackageV1,
  type SocialCalendarSelectedAnchor,
  type SocialPlannerAssetType,
  type SocialPlannerContentArchetype,
  type SocialPlannerEngagementType,
  type SocialPlannerGenerationMetadata,
  type SocialPlannerObjective,
  type SocialPlannerPlatform,
  type SocialPlannerProductionSpec,
  type SocialPlannerSourceSignal,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION,
  type SocialPlannerAudiencePlanEntry,
  type SocialPlannerContentWeight,
  type SocialPlannerFormatPlanEntry,
  type SocialPlannerIgnoredOpportunityPlan,
  type SocialPlannerSelectedOpportunityPlan,
  type SocialPlannerWeeklyStrategyV1,
} from "@/services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerStrategyValidationError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  buildAssetCreativeFingerprint,
  buildWeekFingerprint,
  hookPrefix,
  normalizeComparableText,
} from "@/services/socialPlanner/generation/socialPlannerCreativeFingerprint";
import { SOCIAL_CALENDAR_PERIOD_DAYS } from "@/services/socialPlanner/socialCalendarTypes";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";

const LIMITS = SOCIAL_PLANNER_PACKAGE_LIMITS;
const WEIGHTS = ["low", "moderate", "high"] as const;
const AUDIENCE_ROLES = ["primary", "secondary"] as const;

export type SocialPlannerDiversityPolicy = {
  guided: boolean;
  minDistinctAssetTypes: number;
  maxRepeatsPerAssetType: number;
  minNonStaticAssets: number;
  maxPromotionalAssets: number;
  minDistinctObjectives: number;
  minAuthorityAssets: number;
  maxSameTopic: number;
  maxSameTopicAngle: number;
  maxHolidayAnchorDays: number;
  maxSharedHookPrefix: number;
  minDistinctAudiencesWhenMultiplePersonas: number;
};

export function resolveDiversityPolicy(
  userGuidance: string | null,
): SocialPlannerDiversityPolicy {
  const guided = Boolean(userGuidance?.trim());
  const base: SocialPlannerDiversityPolicy = guided
    ? { ...SOCIAL_PLANNER_DIVERSITY_GUIDED, guided: true }
    : { ...SOCIAL_PLANNER_DIVERSITY_DEFAULTS, guided: false };
  if (guided && /\b(only|all|every)\s+(image|photo|static|graphic)s?\b/i.test(userGuidance!)) {
    base.minNonStaticAssets = 0;
  }
  return base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function boundedString(
  value: unknown,
  field: string,
  max: number,
  failures: string[],
  required = true,
): string | null {
  if (value == null || value === "") {
    if (required) failures.push(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") {
    failures.push(`${field} must be a string.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) failures.push(`${field} must not be empty.`);
    return null;
  }
  if (trimmed.length > max) {
    failures.push(`${field} exceeds ${max} characters.`);
  }
  return trimmed;
}

function jsonChars(value: unknown): number {
  return JSON.stringify(value).length;
}

function collectStringLeaves(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStringLeaves(entry, acc);
    return acc;
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) collectStringLeaves(entry, acc);
  }
  return acc;
}

function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function isAssetType(value: unknown): value is SocialPlannerAssetType {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_ASSET_TYPES as readonly string[]).includes(value)
  );
}

function isObjective(value: unknown): value is SocialPlannerObjective {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_OBJECTIVES as readonly string[]).includes(value)
  );
}

function isArchetype(value: unknown): value is SocialPlannerContentArchetype {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_CONTENT_ARCHETYPES as readonly string[]).includes(value)
  );
}

function isPlatform(value: unknown): value is SocialPlannerPlatform {
  return (
    typeof value === "string" &&
    (SOCIAL_PLANNER_PLATFORMS as readonly string[]).includes(value)
  );
}

function candidateMap(
  context: SocialCalendarContext,
): Map<string, SocialCalendarOpportunity> {
  return new Map(
    context.opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
}

function weekdayForDate(
  context: SocialCalendarContext,
  date: string,
): SocialCalendarDayName | null {
  const day = context.dayContexts.find((entry) => entry.date === date);
  if (!day) return null;
  if (!(SOCIAL_CALENDAR_DAY_NAMES as readonly string[]).includes(day.dayOfWeek)) {
    return null;
  }
  return day.dayOfWeek;
}

export function collectProspectPrivacyTokens(
  context: SocialPlannerGenerationContextV1,
): string[] {
  const tokens = new Set<string>();
  for (const prospect of context.prospects.prospects) {
    const name = prospect.businessName.trim();
    if (name.length >= 3) tokens.add(normalizeComparableText(name));
  }
  return [...tokens];
}

function publicFacingText(pkg: {
  strategySummary: string;
  whyThisWeekWorks: string;
  assets: SocialCalendarAssetV1[];
}): string {
  const parts = [pkg.strategySummary, pkg.whyThisWeekWorks];
  for (const asset of pkg.assets) {
    parts.push(
      asset.socialCopy,
      asset.cta ?? "",
      asset.hook ?? "",
      asset.concept,
      asset.topic,
      asset.angle,
      asset.audience,
      asset.calendarReason ?? "",
      ...collectStringLeaves(asset.productionSpec),
    );
  }
  return normalizeComparableText(parts.join(" "));
}

function parseSelectedAnchor(
  raw: unknown,
  field: string,
  assetDate: string,
  candidates: Map<string, SocialCalendarOpportunity>,
  geography: SocialCalendarContext["geography"],
  failures: string[],
): SocialCalendarSelectedAnchor | null {
  if (!isRecord(raw)) {
    failures.push(`${field} must be an object.`);
    return null;
  }
  const sourceCandidateId = boundedString(
    raw.sourceCandidateId ?? raw.id,
    `${field}.sourceCandidateId`,
    160,
    failures,
  );
  if (!sourceCandidateId) return null;

  const candidate = candidates.get(sourceCandidateId);
  if (!candidate) {
    failures.push(
      `${field}: unknown calendar opportunity ${sourceCandidateId}.`,
    );
    return null;
  }

  if (!opportunityAppliesToGeography(candidate, geography)) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} is outside the trusted jurisdiction.`,
    );
    return null;
  }

  const date = asString(raw.date) ?? candidate.date;
  if (date !== candidate.date) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} date does not match the candidate.`,
    );
  }
  if (date !== assetDate) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} cannot attach to ${assetDate}.`,
    );
  }

  const label = asString(raw.label) ?? candidate.label;
  const category = asString(raw.category) ?? candidate.category;
  if (
    !(SOCIAL_CALENDAR_OPPORTUNITY_CATEGORIES as readonly string[]).includes(
      category,
    )
  ) {
    failures.push(`${field}.category is unsupported.`);
  }
  if (category !== candidate.category) {
    failures.push(
      `${field}: calendar opportunity ${sourceCandidateId} category does not match the candidate.`,
    );
  }

  const scope = asString(raw.scope) ?? candidate.scope;
  if (!(SOCIAL_CALENDAR_OPPORTUNITY_SCOPES as readonly string[]).includes(scope)) {
    failures.push(`${field}.scope is unsupported.`);
  }

  const reason = boundedString(
    raw.reason,
    `${field}.reason`,
    LIMITS.calendarReasonMaxChars,
    failures,
  );

  return {
    sourceCandidateId,
    date: candidate.date,
    label,
    category: candidate.category,
    scope: candidate.scope,
    jurisdictionCountryCode: candidate.jurisdictionCountryCode,
    jurisdictionRegionCode: candidate.jurisdictionRegionCode,
    jurisdictionHemisphere: candidate.jurisdictionHemisphere,
    reason: reason ?? "Selected as a relevant calendar anchor.",
  };
}

function parseProductionSpec(
  raw: unknown,
  assetType: SocialPlannerAssetType | null,
  field: string,
  failures: string[],
): SocialPlannerProductionSpec | null {
  if (!isRecord(raw)) {
    failures.push(`${field} must be an object.`);
    return null;
  }
  const family = assetType ? SOCIAL_PLANNER_ASSET_TYPE_FAMILY[assetType] : null;
  const expectedKind = family
    ? SOCIAL_PLANNER_FAMILY_PRODUCTION_KIND[family]
    : null;
  const kind = asString(raw.kind);
  if (!kind) {
    failures.push(`${field}.kind is required.`);
    return null;
  }
  if (expectedKind && kind !== expectedKind) {
    failures.push(
      `${field}.kind must be ${expectedKind} for asset type ${assetType}.`,
    );
  }

  if (kind === "static") {
    return {
      kind: "static",
      imagePrompt:
        boundedString(raw.imagePrompt, `${field}.imagePrompt`, LIMITS.productionPromptMaxChars, failures) ??
        "",
      composition:
        boundedString(raw.composition, `${field}.composition`, LIMITS.stringFieldDefaultMaxChars, failures) ??
        "",
      setting:
        boundedString(raw.setting, `${field}.setting`, LIMITS.stringFieldDefaultMaxChars, failures) ??
        "",
      subjects:
        boundedString(raw.subjects, `${field}.subjects`, LIMITS.stringFieldDefaultMaxChars, failures) ??
        "",
      overlayCopyGuidance: asNullableString(raw.overlayCopyGuidance),
      visualTone:
        boundedString(raw.visualTone, `${field}.visualTone`, LIMITS.stringFieldDefaultMaxChars, failures) ??
        "",
    };
  }

  if (kind === "carousel") {
    const slidesRaw = Array.isArray(raw.slides) ? raw.slides : null;
    if (!slidesRaw) {
      failures.push(`${field}.slides must be an array.`);
      return {
        kind: "carousel",
        visualDirection: "",
        slideCount: 0,
        slides: [],
        designPrompt: "",
      };
    }
    if (
      slidesRaw.length < LIMITS.carouselSlidesMin ||
      slidesRaw.length > LIMITS.carouselSlidesMax
    ) {
      failures.push(
        `${field}.slides must contain ${LIMITS.carouselSlidesMin}-${LIMITS.carouselSlidesMax} slides.`,
      );
    }
    const slides = slidesRaw.map((slide, index) => {
      const record = isRecord(slide) ? slide : {};
      return {
        index: index + 1,
        headline:
          boundedString(record.headline, `${field}.slides[${index}].headline`, 160, failures) ??
          "",
        body:
          boundedString(
            record.body,
            `${field}.slides[${index}].body`,
            LIMITS.carouselSlideMaxChars,
            failures,
          ) ?? "",
        visualNote:
          boundedString(
            record.visualNote,
            `${field}.slides[${index}].visualNote`,
            LIMITS.carouselSlideMaxChars,
            failures,
          ) ?? "",
      };
    });
    return {
      kind: "carousel",
      visualDirection:
        boundedString(
          raw.visualDirection,
          `${field}.visualDirection`,
          LIMITS.stringFieldDefaultMaxChars,
          failures,
        ) ?? "",
      slideCount: slides.length,
      slides,
      designPrompt:
        boundedString(
          raw.designPrompt,
          `${field}.designPrompt`,
          LIMITS.productionPromptMaxChars,
          failures,
        ) ?? "",
    };
  }

  if (kind === "video") {
    const shotsRaw = Array.isArray(raw.shotPlan) ? raw.shotPlan : null;
    if (!shotsRaw) {
      failures.push(`${field}.shotPlan must be an array.`);
    }
    const shotPlan = (shotsRaw ?? []).map((shot, index) => {
      const record = isRecord(shot) ? shot : {};
      return {
        shot: index + 1,
        action:
          boundedString(record.action, `${field}.shotPlan[${index}].action`, 400, failures) ??
          "",
        framing:
          boundedString(record.framing, `${field}.shotPlan[${index}].framing`, 240, failures) ??
          "",
      };
    });
    if (
      shotPlan.length < LIMITS.videoShotsMin ||
      shotPlan.length > LIMITS.videoShotsMax
    ) {
      failures.push(
        `${field}.shotPlan must contain ${LIMITS.videoShotsMin}-${LIMITS.videoShotsMax} shots.`,
      );
    }
    const dialogue = asNullableString(raw.dialogue);
    if (dialogue && dialogue.length > LIMITS.videoDialogueMaxChars) {
      failures.push(`${field}.dialogue exceeds ${LIMITS.videoDialogueMaxChars} characters.`);
    }
    return {
      kind: "video",
      videoConcept:
        boundedString(raw.videoConcept, `${field}.videoConcept`, LIMITS.conceptMaxChars, failures) ??
        "",
      hook:
        boundedString(raw.hook, `${field}.hook`, LIMITS.hookMaxChars, failures) ??
        "",
      shotPlan,
      dialogue,
      environment:
        boundedString(raw.environment, `${field}.environment`, LIMITS.stringFieldDefaultMaxChars, failures) ??
        "",
      productionDirection:
        boundedString(
          raw.productionDirection,
          `${field}.productionDirection`,
          LIMITS.productionPromptMaxChars,
          failures,
        ) ?? "",
      visualTone:
        boundedString(raw.visualTone, `${field}.visualTone`, LIMITS.stringFieldDefaultMaxChars, failures) ??
        "",
    };
  }

  if (kind === "document") {
    const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : null;
    if (!sectionsRaw) {
      failures.push(`${field}.sections must be an array.`);
    }
    const sections = (sectionsRaw ?? []).map((section, index) => {
      const record = isRecord(section) ? section : {};
      return {
        heading:
          boundedString(record.heading, `${field}.sections[${index}].heading`, 160, failures) ??
          "",
        content:
          boundedString(
            record.content,
            `${field}.sections[${index}].content`,
            LIMITS.productionPromptMaxChars,
            failures,
          ) ?? "",
      };
    });
    if (
      sections.length < LIMITS.documentSectionsMin ||
      sections.length > LIMITS.documentSectionsMax
    ) {
      failures.push(
        `${field}.sections must contain ${LIMITS.documentSectionsMin}-${LIMITS.documentSectionsMax} sections.`,
      );
    }
    return {
      kind: "document",
      documentConcept:
        boundedString(
          raw.documentConcept,
          `${field}.documentConcept`,
          LIMITS.conceptMaxChars,
          failures,
        ) ?? "",
      sections,
      designPrompt:
        boundedString(
          raw.designPrompt,
          `${field}.designPrompt`,
          LIMITS.productionPromptMaxChars,
          failures,
        ) ?? "",
    };
  }

  if (kind === "engagement") {
    const engagementType = asString(raw.engagementType);
    if (
      !engagementType ||
      !(SOCIAL_PLANNER_ENGAGEMENT_TYPES as readonly string[]).includes(
        engagementType,
      )
    ) {
      failures.push(`${field}.engagementType is unsupported.`);
    }
    const options = Array.isArray(raw.options)
      ? raw.options
          .map((option) => (typeof option === "string" ? option.trim() : ""))
          .filter(Boolean)
      : null;
    if (engagementType === "poll" || engagementType === "quiz") {
      if (
        !options ||
        options.length < LIMITS.pollOptionsMin ||
        options.length > LIMITS.pollOptionsMax
      ) {
        failures.push(
          `${field}.options must contain ${LIMITS.pollOptionsMin}-${LIMITS.pollOptionsMax} choices for ${engagementType}.`,
        );
      }
    }
    return {
      kind: "engagement",
      engagementType: (engagementType ?? "question") as SocialPlannerEngagementType,
      prompt:
        boundedString(raw.prompt, `${field}.prompt`, LIMITS.socialCopyMaxChars, failures) ??
        "",
      options,
      visualSupport: asNullableString(raw.visualSupport),
    };
  }

  failures.push(`${field}.kind is unsupported.`);
  return null;
}

function parseSourceSignals(
  raw: unknown,
  field: string,
  allowedPersonaIds: Set<string>,
  allowedAnchorIds: Set<string>,
  failures: string[],
): SocialPlannerSourceSignal[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    failures.push(`${field} must be an array.`);
    return [];
  }
  if (raw.length > LIMITS.sourceSignalsMax) {
    failures.push(`${field} exceeds ${LIMITS.sourceSignalsMax} entries.`);
  }
  const signals: SocialPlannerSourceSignal[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      failures.push(`${field}[${index}] must be an object.`);
      continue;
    }
    const type = asString(entry.type);
    if (
      !type ||
      !(SOCIAL_PLANNER_SOURCE_SIGNAL_TYPES as readonly string[]).includes(type)
    ) {
      failures.push(`${field}[${index}].type is unsupported.`);
      continue;
    }
    if (type === "prospect_portfolio" && entry.id != null && entry.id !== "") {
      failures.push(
        `${field}[${index}] must not include a Prospect id in generated output.`,
      );
    }
    const id = asNullableString(entry.id);
    if (type === "persona" && id && !allowedPersonaIds.has(id)) {
      failures.push(`${field}[${index}] invented Persona id ${id}.`);
    }
    if (type === "calendar_opportunity" && id && !allowedAnchorIds.has(id)) {
      failures.push(
        `${field}[${index}] calendar opportunity ${id} is not selected on this asset.`,
      );
    }
    signals.push({
      type: type as SocialPlannerSourceSignal["type"],
      id: type === "prospect_portfolio" ? null : id,
    });
  }
  return signals;
}

function parseAsset(
  raw: unknown,
  index: number,
  expectedDate: string,
  context: SocialPlannerGenerationContextV1,
  failures: string[],
): SocialCalendarAssetV1 | null {
  const field = `assets[${index}]`;
  if (!isRecord(raw)) {
    failures.push(`${field} must be an object.`);
    return null;
  }

  const date = asString(raw.date);
  if (date !== expectedDate) {
    failures.push(
      `${field}.date must be ${expectedDate} from Calendar Context.`,
    );
  }
  const resolvedDate = expectedDate;
  const weekday = weekdayForDate(context.calendarContext, resolvedDate);
  if (!weekday) {
    failures.push(`${field}.weekday could not be reconstructed from Calendar Context.`);
    return null;
  }

  if (!isAssetType(raw.assetType)) {
    failures.push(`${field}.assetType is unsupported.`);
  }
  if (!isArchetype(raw.contentArchetype)) {
    failures.push(`${field}.contentArchetype is unsupported.`);
  }
  if (!isObjective(raw.primaryObjective)) {
    failures.push(`${field}.primaryObjective is unsupported.`);
  }

  const assetType = isAssetType(raw.assetType) ? raw.assetType : null;
  const concept = boundedString(raw.concept, `${field}.concept`, LIMITS.conceptMaxChars, failures);
  const topic = boundedString(raw.topic, `${field}.topic`, LIMITS.topicMaxChars, failures);
  const angle = boundedString(raw.angle, `${field}.angle`, LIMITS.angleMaxChars, failures);
  const audience = boundedString(
    raw.audience,
    `${field}.audience`,
    LIMITS.audienceMaxChars,
    failures,
  );
  const socialCopy = boundedString(
    raw.socialCopy,
    `${field}.socialCopy`,
    LIMITS.socialCopyMaxChars,
    failures,
  );
  const hook = asNullableString(raw.hook);
  if (hook && hook.length > LIMITS.hookMaxChars) {
    failures.push(`${field}.hook exceeds ${LIMITS.hookMaxChars} characters.`);
  }
  const cta = asNullableString(raw.cta);
  if (cta && cta.length > LIMITS.ctaMaxChars) {
    failures.push(`${field}.cta exceeds ${LIMITS.ctaMaxChars} characters.`);
  }
  if (
    isObjective(raw.primaryObjective) &&
    (SOCIAL_PLANNER_PROMOTIONAL_OBJECTIVES as readonly string[]).includes(
      raw.primaryObjective,
    ) &&
    !cta
  ) {
    failures.push(`${field}.cta is required for ${raw.primaryObjective} assets.`);
  }

  const personaIdsRaw = Array.isArray(raw.personaIds)
    ? raw.personaIds
    : raw.personaId
      ? [raw.personaId]
      : [];
  const allowedPersonaIds = new Set(
    context.personas.personas.map((persona) => persona.id),
  );
  const personaIds = personaIdsRaw
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  if (personaIds.length > LIMITS.personaIdsPerAssetMax) {
    failures.push(
      `${field}.personaIds exceeds ${LIMITS.personaIdsPerAssetMax} entries.`,
    );
  }
  for (const personaId of personaIds) {
    if (!allowedPersonaIds.has(personaId)) {
      failures.push(`${field} invented Persona id ${personaId}.`);
    }
  }

  const candidates = candidateMap(context.calendarContext);
  const anchorsRaw = Array.isArray(raw.calendarAnchors)
    ? raw.calendarAnchors
    : [];
  if (anchorsRaw.length > LIMITS.anchorsPerAssetMax) {
    failures.push(
      `${field}.calendarAnchors exceeds ${LIMITS.anchorsPerAssetMax} entries.`,
    );
  }
  const calendarAnchors = anchorsRaw
    .map((anchor, anchorIndex) =>
      parseSelectedAnchor(
        anchor,
        `${field}.calendarAnchors[${anchorIndex}]`,
        resolvedDate,
        candidates,
        context.calendarContext.geography,
        failures,
      ),
    )
    .filter((anchor): anchor is SocialCalendarSelectedAnchor => Boolean(anchor));

  const calendarReason = asNullableString(raw.calendarReason);
  if (calendarReason && calendarReason.length > LIMITS.calendarReasonMaxChars) {
    failures.push(
      `${field}.calendarReason exceeds ${LIMITS.calendarReasonMaxChars} characters.`,
    );
  }
  if (calendarAnchors.length === 0 && calendarReason) {
    failures.push(
      `${field}.calendarReason must be null when no calendar anchors are selected.`,
    );
  }

  const productionSpec = parseProductionSpec(
    raw.productionSpec,
    assetType,
    `${field}.productionSpec`,
    failures,
  );

  const platformsRaw = Array.isArray(raw.recommendedPlatforms)
    ? raw.recommendedPlatforms
    : [];
  if (
    platformsRaw.length < LIMITS.platformsMin ||
    platformsRaw.length > LIMITS.platformsMax
  ) {
    failures.push(
      `${field}.recommendedPlatforms must contain ${LIMITS.platformsMin}-${LIMITS.platformsMax} platforms.`,
    );
  }
  const recommendedPlatforms: SocialPlannerPlatform[] = [];
  for (const platform of platformsRaw) {
    if (!isPlatform(platform)) {
      failures.push(`${field}.recommendedPlatforms contains an unsupported platform.`);
      continue;
    }
    if (!recommendedPlatforms.includes(platform)) {
      recommendedPlatforms.push(platform);
    }
  }

  const sourceSignals = parseSourceSignals(
    raw.sourceSignals,
    `${field}.sourceSignals`,
    allowedPersonaIds,
    new Set(calendarAnchors.map((anchor) => anchor.sourceCandidateId)),
    failures,
  );

  if (
    !assetType ||
    !isArchetype(raw.contentArchetype) ||
    !isObjective(raw.primaryObjective) ||
    !concept ||
    !topic ||
    !angle ||
    !audience ||
    !socialCopy ||
    !productionSpec
  ) {
    return null;
  }

  const draft: Omit<SocialCalendarAssetV1, "creativeFingerprint"> = {
    date: resolvedDate,
    weekday,
    assetType,
    contentArchetype: raw.contentArchetype,
    primaryObjective: raw.primaryObjective,
    audience,
    personaIds,
    topic,
    angle,
    hook,
    concept,
    calendarAnchors,
    calendarReason: calendarAnchors.length > 0 ? calendarReason : null,
    productionSpec,
    socialCopy,
    cta,
    recommendedPlatforms,
    sourceSignals,
  };

  const asset: SocialCalendarAssetV1 = {
    ...draft,
    creativeFingerprint: buildAssetCreativeFingerprint(draft),
  };

  if (jsonChars(asset) > LIMITS.assetMaxChars) {
    failures.push(`${field} exceeds the ${LIMITS.assetMaxChars} character budget.`);
  }

  return asset;
}

function validatePortfolio(
  assets: SocialCalendarAssetV1[],
  context: SocialPlannerGenerationContextV1,
  userGuidance: string | null,
  failures: string[],
): void {
  const policy = resolveDiversityPolicy(userGuidance);
  const typeCounts = new Map<string, number>();
  const objectiveCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  const topicAngleCounts = new Map<string, number>();
  const hookCounts = new Map<string, number>();
  const prefixCounts = new Map<string, number>();
  const audiences = new Set<string>();
  let nonStatic = 0;
  let promotional = 0;
  let authority = 0;
  let holidayDays = 0;

  for (const asset of assets) {
    typeCounts.set(asset.assetType, (typeCounts.get(asset.assetType) ?? 0) + 1);
    objectiveCounts.set(
      asset.primaryObjective,
      (objectiveCounts.get(asset.primaryObjective) ?? 0) + 1,
    );
    const topicKey = asset.creativeFingerprint.topic;
    topicCounts.set(topicKey, (topicCounts.get(topicKey) ?? 0) + 1);
    const combo = `${topicKey}|${asset.creativeFingerprint.angle}`;
    topicAngleCounts.set(combo, (topicAngleCounts.get(combo) ?? 0) + 1);
    if (asset.creativeFingerprint.family !== "static") nonStatic += 1;
    if (
      (SOCIAL_PLANNER_PROMOTIONAL_OBJECTIVES as readonly string[]).includes(
        asset.primaryObjective,
      )
    ) {
      promotional += 1;
    }
    if (
      (SOCIAL_PLANNER_AUTHORITY_OBJECTIVES as readonly string[]).includes(
        asset.primaryObjective,
      )
    ) {
      authority += 1;
    }
    if (
      asset.calendarAnchors.some((anchor) =>
        (SOCIAL_PLANNER_HOLIDAY_ANCHOR_CATEGORIES as readonly string[]).includes(
          anchor.category,
        ),
      )
    ) {
      holidayDays += 1;
    }
    audiences.add(
      asset.personaIds[0] ?? asset.creativeFingerprint.audience,
    );
    if (asset.creativeFingerprint.hookNormalized) {
      hookCounts.set(
        asset.creativeFingerprint.hookNormalized,
        (hookCounts.get(asset.creativeFingerprint.hookNormalized) ?? 0) + 1,
      );
      const prefix = hookPrefix(asset.hook);
      if (prefix) {
        prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
      }
    }
  }

  if (typeCounts.size < policy.minDistinctAssetTypes) {
    failures.push(
      `Weekly portfolio must use at least ${policy.minDistinctAssetTypes} distinct asset types.`,
    );
  }
  for (const [assetType, count] of typeCounts) {
    if (count > policy.maxRepeatsPerAssetType) {
      failures.push(
        `Asset type ${assetType} is used ${count} times; maximum is ${policy.maxRepeatsPerAssetType}.`,
      );
    }
  }
  if (nonStatic < policy.minNonStaticAssets) {
    failures.push(
      "Weekly portfolio must include at least one non-static asset.",
    );
  }
  if (promotional > policy.maxPromotionalAssets) {
    failures.push(
      `Promotional/conversion assets (${promotional}) exceed the weekly maximum of ${policy.maxPromotionalAssets}.`,
    );
  }
  if (objectiveCounts.size < policy.minDistinctObjectives) {
    failures.push(
      `Weekly portfolio must use at least ${policy.minDistinctObjectives} distinct objectives.`,
    );
  }
  if (authority < policy.minAuthorityAssets) {
    failures.push(
      "Weekly portfolio must include educational, authority, trust, thought-leadership, or community content.",
    );
  }
  for (const [topic, count] of topicCounts) {
    if (topic && count > policy.maxSameTopic) {
      failures.push(
        `Topic "${topic}" is used ${count} times; maximum is ${policy.maxSameTopic}.`,
      );
    }
  }
  for (const [combo, count] of topicAngleCounts) {
    if (count > policy.maxSameTopicAngle) {
      failures.push(
        `Topic/angle "${combo}" is repeated ${count} times; maximum is ${policy.maxSameTopicAngle}.`,
      );
    }
  }
  if (holidayDays > policy.maxHolidayAnchorDays) {
    failures.push(
      `Holiday/observance anchors appear on ${holidayDays} days; maximum is ${policy.maxHolidayAnchorDays} unless user guidance requires a calendar-centric week.`,
    );
  }
  for (const [hook, count] of hookCounts) {
    if (count > 1) {
      failures.push(`Duplicate normalized hook detected: "${hook}".`);
    }
  }
  for (const [prefix, count] of prefixCounts) {
    if (count > policy.maxSharedHookPrefix) {
      failures.push(
        `Hook prefix "${prefix}" is overused (${count} times).`,
      );
    }
  }
  if (
    context.personas.includedCount >= 2 &&
    audiences.size < policy.minDistinctAudiencesWhenMultiplePersonas
  ) {
    failures.push(
      "Weekly portfolio must rotate audiences when multiple Personas exist.",
    );
  }
}

function validateProspectPrivacy(
  pkg: Pick<SocialCalendarPackageV1, "strategySummary" | "whyThisWeekWorks" | "assets">,
  context: SocialPlannerGenerationContextV1,
  failures: string[],
): void {
  const haystack = publicFacingText(pkg);
  for (const token of collectProspectPrivacyTokens(context)) {
    if (token && haystack.includes(token)) {
      failures.push(
        "Generated Social Calendar output must not expose Prospect business identity.",
      );
      break;
    }
  }
  for (const asset of pkg.assets) {
    if (
      asset.sourceSignals.some(
        (signal) => signal.type === "prospect_portfolio" && signal.id,
      )
    ) {
      failures.push("sourceSignals must not include Prospect ids.");
      break;
    }
  }
}

export function validateSocialPlannerWeeklyStrategy(
  raw: Record<string, unknown>,
  context: SocialPlannerGenerationContextV1,
): SocialPlannerWeeklyStrategyV1 {
  const failures: string[] = [];
  if (raw.schemaVersion !== SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION) {
    failures.push(
      "Weekly strategy schemaVersion must be social_planner_weekly_strategy_v1.",
    );
  }

  const weeklyObjective = boundedString(
    raw.weeklyObjective,
    "weeklyObjective",
    LIMITS.weeklyObjectiveMaxChars,
    failures,
  );
  const secondaryRaw = Array.isArray(raw.secondaryObjectives)
    ? raw.secondaryObjectives
    : [];
  if (secondaryRaw.length > LIMITS.secondaryObjectivesMax) {
    failures.push(
      `secondaryObjectives exceeds ${LIMITS.secondaryObjectivesMax} entries.`,
    );
  }
  const secondaryObjectives = secondaryRaw
    .map((value, index) =>
      boundedString(
        value,
        `secondaryObjectives[${index}]`,
        LIMITS.secondaryObjectiveMaxChars,
        failures,
      ),
    )
    .filter((value): value is string => Boolean(value));

  const allowedPersonaIds = new Set(
    context.personas.personas.map((persona) => persona.id),
  );
  const audiencePlan: SocialPlannerAudiencePlanEntry[] = [];
  const audienceRaw = Array.isArray(raw.audiencePlan) ? raw.audiencePlan : [];
  if (audienceRaw.length > LIMITS.audiencePlanMax) {
    failures.push(`audiencePlan exceeds ${LIMITS.audiencePlanMax} entries.`);
  }
  for (const [index, entry] of audienceRaw.entries()) {
    if (!isRecord(entry)) {
      failures.push(`audiencePlan[${index}] must be an object.`);
      continue;
    }
    const audience = boundedString(
      entry.audience,
      `audiencePlan[${index}].audience`,
      LIMITS.audienceMaxChars,
      failures,
    );
    const role = asString(entry.role);
    if (!role || !(AUDIENCE_ROLES as readonly string[]).includes(role)) {
      failures.push(`audiencePlan[${index}].role is invalid.`);
    }
    const personaId = asNullableString(entry.personaId);
    if (personaId && !allowedPersonaIds.has(personaId)) {
      failures.push(`audiencePlan[${index}] invented Persona id ${personaId}.`);
    }
    if (audience && role && (AUDIENCE_ROLES as readonly string[]).includes(role)) {
      audiencePlan.push({
        audience,
        personaId,
        role: role as SocialPlannerAudiencePlanEntry["role"],
      });
    }
  }

  const topicPlan = (Array.isArray(raw.topicPlan) ? raw.topicPlan : [])
    .slice(0, LIMITS.topicPlanMax)
    .map((entry, index) => {
      if (!isRecord(entry)) {
        failures.push(`topicPlan[${index}] must be an object.`);
        return null;
      }
      const topic = boundedString(
        entry.topic,
        `topicPlan[${index}].topic`,
        LIMITS.topicMaxChars,
        failures,
      );
      const rationale = boundedString(
        entry.rationale,
        `topicPlan[${index}].rationale`,
        LIMITS.stringFieldDefaultMaxChars,
        failures,
      );
      return topic && rationale ? { topic, rationale } : null;
    })
    .filter((entry): entry is { topic: string; rationale: string } => Boolean(entry));

  const dates = context.calendarContext.period.dates;
  const formatRaw = Array.isArray(raw.formatPlan) ? raw.formatPlan : [];
  if (formatRaw.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    failures.push("formatPlan must contain exactly seven day slots.");
  }
  const formatPlan: SocialPlannerFormatPlanEntry[] = [];
  for (let index = 0; index < Math.min(formatRaw.length, dates.length); index += 1) {
    const entry = formatRaw[index];
    if (!isRecord(entry)) {
      failures.push(`formatPlan[${index}] must be an object.`);
      continue;
    }
    if (asString(entry.date) !== dates[index]) {
      failures.push(`formatPlan[${index}].date must be ${dates[index]}.`);
    }
    if (!isAssetType(entry.assetType)) {
      failures.push(`formatPlan[${index}].assetType is unsupported.`);
    }
    if (!isArchetype(entry.contentArchetype)) {
      failures.push(`formatPlan[${index}].contentArchetype is unsupported.`);
    }
    if (!isObjective(entry.primaryObjective)) {
      failures.push(`formatPlan[${index}].primaryObjective is unsupported.`);
    }
    if (
      isAssetType(entry.assetType) &&
      isArchetype(entry.contentArchetype) &&
      isObjective(entry.primaryObjective)
    ) {
      formatPlan.push({
        date: dates[index],
        assetType: entry.assetType,
        contentArchetype: entry.contentArchetype,
        primaryObjective: entry.primaryObjective,
      });
    }
  }

  const candidates = candidateMap(context.calendarContext);
  const calendarRaw = isRecord(raw.calendarOpportunityPlan)
    ? raw.calendarOpportunityPlan
    : {};
  const selected: SocialPlannerSelectedOpportunityPlan[] = [];
  for (const [index, entry] of (
    Array.isArray(calendarRaw.selected) ? calendarRaw.selected : []
  ).entries()) {
    const parsed = parseSelectedAnchor(
      entry,
      `calendarOpportunityPlan.selected[${index}]`,
      isRecord(entry) ? (asString(entry.date) ?? "") : "",
      candidates,
      context.calendarContext.geography,
      failures,
    );
    if (parsed) selected.push(parsed);
  }

  const ignored: SocialPlannerIgnoredOpportunityPlan[] = [];
  for (const [index, entry] of (
    Array.isArray(calendarRaw.ignored) ? calendarRaw.ignored : []
  ).entries()) {
    if (!isRecord(entry)) {
      failures.push(`calendarOpportunityPlan.ignored[${index}] must be an object.`);
      continue;
    }
    const sourceCandidateId = boundedString(
      entry.sourceCandidateId ?? entry.id,
      `calendarOpportunityPlan.ignored[${index}].sourceCandidateId`,
      160,
      failures,
    );
    if (sourceCandidateId && !candidates.has(sourceCandidateId)) {
      failures.push(
        `calendarOpportunityPlan.ignored[${index}] invented calendar opportunity ${sourceCandidateId}.`,
      );
    }
    const reason = boundedString(
      entry.reason,
      `calendarOpportunityPlan.ignored[${index}].reason`,
      LIMITS.calendarReasonMaxChars,
      failures,
    );
    if (sourceCandidateId && reason) {
      ignored.push({ sourceCandidateId, reason });
    }
  }

  const balanceRaw = isRecord(raw.contentBalance) ? raw.contentBalance : {};
  const weight = (value: unknown, field: string): SocialPlannerContentWeight => {
    const text = asString(value);
    if (!text || !(WEIGHTS as readonly string[]).includes(text)) {
      failures.push(`${field} must be low, moderate, or high.`);
      return "moderate";
    }
    return text as SocialPlannerContentWeight;
  };

  const narrativeArc = boundedString(
    raw.narrativeArc,
    "narrativeArc",
    LIMITS.narrativeArcMaxChars,
    failures,
  );
  const creativeDirection = boundedString(
    raw.creativeDirection,
    "creativeDirection",
    LIMITS.creativeDirectionMaxChars,
    failures,
  );
  const avoidances = (Array.isArray(raw.avoidances) ? raw.avoidances : [])
    .slice(0, LIMITS.avoidancesMax)
    .map((value, index) =>
      boundedString(value, `avoidances[${index}]`, LIMITS.stringFieldDefaultMaxChars, failures),
    )
    .filter((value): value is string => Boolean(value));
  const userGuidanceInterpretation = asNullableString(raw.userGuidanceInterpretation);
  if (
    userGuidanceInterpretation &&
    userGuidanceInterpretation.length > LIMITS.userGuidanceInterpretationMaxChars
  ) {
    failures.push(
      `userGuidanceInterpretation exceeds ${LIMITS.userGuidanceInterpretationMaxChars} characters.`,
    );
  }
  const contentBalance = {
    promotionalWeight: weight(balanceRaw.promotionalWeight, "contentBalance.promotionalWeight"),
    educationalWeight: weight(balanceRaw.educationalWeight, "contentBalance.educationalWeight"),
    communityWeight: weight(balanceRaw.communityWeight, "contentBalance.communityWeight"),
    funnelNotes:
      boundedString(
        balanceRaw.funnelNotes,
        "contentBalance.funnelNotes",
        LIMITS.stringFieldDefaultMaxChars,
        failures,
      ) ?? "",
  };

  if (failures.length > 0) {
    throw new SocialPlannerStrategyValidationError(failures);
  }

  return {
    schemaVersion: SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION,
    weeklyObjective: weeklyObjective ?? "",
    secondaryObjectives,
    audiencePlan,
    topicPlan,
    formatPlan,
    calendarOpportunityPlan: { selected, ignored },
    contentBalance,
    narrativeArc: narrativeArc ?? "",
    creativeDirection: creativeDirection ?? "",
    avoidances,
    userGuidanceInterpretation,
  };
}

export function validateAndNormalizeSocialCalendarPackage(input: {
  raw: Record<string, unknown>;
  context: SocialPlannerGenerationContextV1;
  userGuidance: string | null;
  metadata: SocialPlannerGenerationMetadata;
}): SocialCalendarPackageV1 {
  const { raw, context, userGuidance, metadata } = input;
  const structural: string[] = [];
  const portfolio: string[] = [];
  const budget: string[] = [];

  if (raw.schemaVersion !== SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION) {
    structural.push(
      "Package schemaVersion must be social_calendar_package_v1.",
    );
  }

  const dates = context.calendarContext.period.dates;
  if (dates.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    structural.push("Calendar Context must contain exactly seven dates.");
  }

  const assetsRaw = Array.isArray(raw.assets) ? raw.assets : null;
  if (!assetsRaw) {
    structural.push("Package assets must be an array.");
  } else if (assetsRaw.length !== SOCIAL_CALENDAR_PERIOD_DAYS) {
    structural.push("Package must contain exactly seven assets.");
  }

  const strategySummary = boundedString(
    raw.strategySummary,
    "strategySummary",
    LIMITS.strategySummaryMaxChars,
    structural,
  );
  const whyThisWeekWorks = boundedString(
    raw.whyThisWeekWorks,
    "whyThisWeekWorks",
    LIMITS.whyThisWeekWorksMaxChars,
    structural,
  );
  if (whyThisWeekWorks) {
    if (whyThisWeekWorks.length < LIMITS.whyThisWeekWorksMinChars) {
      structural.push(
        `whyThisWeekWorks must be at least ${LIMITS.whyThisWeekWorksMinChars} characters.`,
      );
    }
    const sentences = countSentences(whyThisWeekWorks);
    if (
      sentences < LIMITS.whyThisWeekWorksMinSentences ||
      sentences > LIMITS.whyThisWeekWorksMaxSentences
    ) {
      structural.push(
        `whyThisWeekWorks must be ${LIMITS.whyThisWeekWorksMinSentences}-${LIMITS.whyThisWeekWorksMaxSentences} concise sentences.`,
      );
    }
  }

  const assets: SocialCalendarAssetV1[] = [];
  if (assetsRaw) {
    const count = Math.max(assetsRaw.length, dates.length);
    for (let index = 0; index < count; index += 1) {
      const expectedDate = dates[index];
      if (!expectedDate) {
        structural.push(`Unexpected extra asset at index ${index}.`);
        continue;
      }
      if (!assetsRaw[index]) {
        structural.push(`Missing asset for ${expectedDate}.`);
        continue;
      }
      const parsed = parseAsset(
        assetsRaw[index],
        index,
        expectedDate,
        context,
        structural,
      );
      if (parsed) assets.push(parsed);
    }
  }

  const seenDates = assets.map((asset) => asset.date);
  if (new Set(seenDates).size !== seenDates.length) {
    structural.push("Package dates must be unique.");
  }

  if (assets.length === SOCIAL_CALENDAR_PERIOD_DAYS && strategySummary && whyThisWeekWorks) {
    validatePortfolio(assets, context, userGuidance, portfolio);
    validateProspectPrivacy(
      { strategySummary, whyThisWeekWorks, assets },
      context,
      portfolio,
    );
  }

  const draft: SocialCalendarPackageV1 = {
    schemaVersion: SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
    period: {
      periodStart: context.calendarContext.period.periodStart,
      periodEnd: context.calendarContext.period.periodEnd,
      dates: [...dates],
    },
    strategySummary: strategySummary ?? "",
    whyThisWeekWorks: whyThisWeekWorks ?? "",
    assets,
    weekFingerprint: buildWeekFingerprint(assets),
    generationMetadata: metadata,
  };

  const size = jsonChars(draft);
  if (size > LIMITS.packageMaxChars) {
    budget.push(
      `Package exceeds the ${LIMITS.packageMaxChars} character hard budget (${size}).`,
    );
  }

  if (structural.length > 0) {
    throw new SocialCalendarPackageValidationError("structural", structural);
  }
  if (portfolio.length > 0) {
    throw new SocialCalendarPackageValidationError("portfolio", portfolio);
  }
  if (budget.length > 0) {
    throw new SocialCalendarPackageValidationError("budget", budget);
  }

  return draft;
}
