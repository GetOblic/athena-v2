import { composeSocialCalendarContext } from "../../services/socialPlanner/calendar/composeSocialCalendarContext";
import type { SocialCalendarContext } from "../../services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_ASSET_PROMPT_VERSION,
  SOCIAL_PLANNER_REPAIR_PROMPT_VERSION,
  type SocialCalendarAssetV1,
  type SocialPlannerAssetType,
  type SocialPlannerContentArchetype,
  type SocialPlannerGenerationMetadata,
  type SocialPlannerObjective,
  type SocialPlannerPlatform,
  type SocialPlannerProductionSpec,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION } from "../../services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";
import { SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialPlannerWeeklyStrategyTypes";
import { validateAndNormalizeSocialCalendarPackage } from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import type {
  SocialCalendarGenerationMode,
  SocialCalendarPackageJson,
  SocialCalendarStatus,
} from "../../services/socialPlanner/socialCalendarTypes";
import type { SocialPlannerHistoryRow } from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import type { SocialCalendarPackageV1 } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
  SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
  type SocialPlannerGenerationContextV1,
  type SocialPlannerPersonaIntelligence,
} from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "../../services/superAdmin/strategicBlueprintInstructionConstants";

export const TEST_ORG = "org-social-planner";
export const TEST_FOREIGN_ORG = "org-foreign-tenant";
export const TEST_PERIOD_START = "2026-05-10";
export const TEST_PERIOD_END = "2026-05-16";

const ASSET_PLAN: Array<{
  assetType: SocialPlannerAssetType;
  contentArchetype: SocialPlannerContentArchetype;
  primaryObjective: SocialPlannerObjective;
  platforms: SocialPlannerPlatform[];
  topic: string;
  hook: string;
}> = [
  {
    assetType: "carousel",
    contentArchetype: "educational",
    primaryObjective: "educate",
    platforms: ["instagram", "linkedin"],
    topic: "preventive care",
    hook: "Three quiet signs a cleaning is overdue.",
  },
  {
    assetType: "talking_head_video",
    contentArchetype: "opinion",
    primaryObjective: "thought_leadership",
    platforms: ["tiktok", "youtube_shorts"],
    topic: "appointment anxiety",
    hook: "Waiting rooms should not feel like detention.",
  },
  {
    assetType: "branded_graphic",
    contentArchetype: "problem_solution",
    primaryObjective: "trust",
    platforms: ["instagram", "facebook"],
    topic: "same-week bookings",
    hook: "Evenings are when family schedules actually open.",
  },
  {
    assetType: "checklist",
    contentArchetype: "how_to",
    primaryObjective: "educate",
    platforms: ["linkedin", "facebook"],
    topic: "first visit prep",
    hook: "Bring these four things to a first visit.",
  },
  {
    assetType: "poll",
    contentArchetype: "question",
    primaryObjective: "engage",
    platforms: ["instagram", "threads"],
    topic: "after-school slots",
    hook: "When do you actually want to be seen?",
  },
  {
    assetType: "demonstration_video",
    contentArchetype: "behind_the_scenes",
    primaryObjective: "community",
    platforms: ["tiktok", "instagram"],
    topic: "sterilization routine",
    hook: "This is the two-minute reset between patients.",
  },
  {
    assetType: "quote_visual",
    contentArchetype: "story",
    primaryObjective: "nurture",
    platforms: ["facebook", "threads"],
    topic: "family memberships",
    hook: "One reminder that kept a whole household on schedule.",
  },
];

export function testCalendar(
  extras: Partial<Parameters<typeof composeSocialCalendarContext>[0]> = {},
): SocialCalendarContext {
  return composeSocialCalendarContext({
    periodStart: extras.periodStart ?? TEST_PERIOD_START,
    periodEnd: extras.periodEnd ?? TEST_PERIOD_END,
    geographyEvidence: extras.geographyEvidence ?? {
      executiveGeographicReach: "United States",
    },
  });
}

function persona(
  id: string,
  name: string,
): SocialPlannerPersonaIntelligence {
  return {
    id,
    name,
    category: "Parent",
    occupation: "Teacher",
    seniority: null,
    audienceSegment: "Local families",
    needs: "Reliable appointments",
    painPoints: "Hard to book after work",
    motivations: "Keep kids healthy",
    objections: "Price",
    contentInterests: "School calendars",
    decisionDrivers: "Trust and hours",
    communicationPreferences: "Friendly SMS",
    audienceGeography: "San Diego",
    status: "Ready",
    lifecycleStatus: "In Use",
  };
}

export function buildGenerationContext(input?: {
  calendar?: SocialCalendarContext;
  personas?: SocialPlannerPersonaIntelligence[];
  prospectName?: string;
  trendConfigured?: boolean;
  adsCopy?: string;
}): SocialPlannerGenerationContextV1 {
  const calendar = input?.calendar ?? testCalendar();
  const personas = input?.personas ?? [
    persona("persona-parent", "Busy Parent"),
    persona("persona-retiree", "Active Retiree"),
  ];
  const trendConfigured = input?.trendConfigured ?? true;
  const prospectName = input?.prospectName ?? "Hidden Dental Group LLC";

  return {
    schemaVersion: SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
    organization: {
      id: TEST_ORG,
      name: "Harbor Clinic",
      slug: "harbor",
      website: "https://harbor.example",
      aboutYou: "Neighborhood dental clinic",
      expertise: "Family dentistry",
      brainStatus: "ready",
      isBrainTrained: true,
    },
    brain: {
      available: true,
      isBrainTrained: true,
      completenessScore: 88,
      masterProfileVersion: "mp-3",
      homepageLearning: "Preventive care for families.",
      contextWarnings: [],
      missingSetupFields: [],
      domains: [{ name: "Local health", market: "Healthcare", niche: "Dentistry", description: "Family care" }],
      targetAudiences: ["Local parents"],
      businessGoals: ["Book hygiene visits"],
    },
    identityExecutiveIntelligence: {
      available: true,
      executiveSummary: "Harbor Clinic serves local families with preventive dentistry.",
      confidenceLevel: "strong",
      businessModel: {
        business_overview: "Family dentistry",
        primary_audience: "Local families",
        positioning: "Preventive-first care",
        geographic_reach: "United States",
        communication_style: "Warm and plain",
        products_and_services: "Cleanings",
      },
      hiddenSignals: [{ finding: "Same-week bookings", whyItMatters: "Speed" }],
    },
    websiteIntelligence: {
      available: true,
      provider: "deep_v1",
      url: "https://harbor.example",
      scrapedAt: "2026-04-01T12:00:00.000Z",
      pagesAnalyzed: 4,
      businessKnowledge: { services: "Cleanings and exams" },
      crawlSummary: {
        pagesAnalyzed: 4,
        servicesDiscovered: 2,
        faqsDiscovered: 1,
        testimonialsDiscovered: 0,
      },
      pageThemes: [{ url: "https://harbor.example/", title: "Home", pageType: "homepage" }],
    },
    seoIntelligence: [],
    discussions: [],
    personas: {
      consideredCount: personas.length,
      includedCount: personas.length,
      distinctCategories: [...new Set(personas.map((row) => row.category).filter((value): value is string => Boolean(value)))],
      distinctOccupations: [...new Set(personas.map((row) => row.occupation).filter((value): value is string => Boolean(value)))],
      distinctAudienceGeographies: [...new Set(personas.map((row) => row.audienceGeography).filter((value): value is string => Boolean(value)))],
      personas,
    },
    prospects: {
      consideredCount: 1,
      includedCount: 1,
      prospects: [
        {
          id: "prospect-secret",
          businessName: prospectName,
          industry: "Healthcare",
          category: "Clinic",
          geography: "San Diego",
          commercialNeed: "Evening hours",
          painPoints: "No-show patients",
          status: "Ready",
          lifecycleStatus: "Qualified",
        },
      ],
    },
    opportunities: [],
    ads: [
      {
        id: "ad-1",
        name: "Spring cleaning push",
        role: "existing_campaign_reference",
        objective: "Bookings",
        audience: "Parents",
        offer: "New-patient exam",
        positioning: "Calm family dentistry",
        messageAngle: input?.adsCopy ?? "Distinctive spring-cleaning slogan never reuse",
        keywordThemes: ["cleaning"],
      },
    ],
    strategicAssetBlueprints: [
      {
        id: "bp-1",
        contextType: "organization",
        discussionId: null,
        opportunityId: null,
        briefingId: null,
        assetTitle: "Membership one-pager",
        assetType: "pdf",
        businessGoal: "Explain membership",
        targetAudience: "Parents",
        imagePromptTheme: "Warm clinic",
        pdfPromptTheme: "Simple checklist",
        socialPromptTheme: "Do not copy this exact membership line",
        historicalTrendSocialOutput: null,
        notes: null,
      },
    ],
    trendSocialPrompt: trendConfigured
      ? {
          key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
          configured: true,
          revisionId: "trend-rev-1",
          updatedAt: "2026-04-01T00:00:00.000Z",
          instructionText: "Prefer native short-form hooks and platform-native pacing.",
        }
      : {
          key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
          configured: false,
          revisionId: null,
          updatedAt: null,
          instructionText: "",
        },
    calendarContext: calendar,
    provenance: {
      composerVersion: SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
      schemaVersion: SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
      organizationId: TEST_ORG,
      brainAvailable: true,
      masterProfileVersion: "mp-3",
      websiteIntelligenceScrapedAt: "2026-04-01T12:00:00.000Z",
      websitePagesAnalyzed: 4,
      discussionIds: [],
      currentExecutiveVersionIds: [],
      personaIds: personas.map((row) => row.id),
      prospectIds: ["prospect-secret"],
      opportunityIds: [],
      seoReportIds: [],
      adCampaignIds: ["ad-1"],
      blueprintIds: ["bp-1"],
      trendSocialPrompt: {
        key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
        configured: trendConfigured,
        revisionId: trendConfigured ? "trend-rev-1" : null,
      },
      calendar: {
        resolverVersion: calendar.provenance.resolverVersion,
        schemaVersion: calendar.provenance.schemaVersion,
        holidayCoverage: calendar.provenance.holidayCoverage,
        holidayProvider: calendar.provenance.holidayProvider,
        holidayProviderVersion: calendar.provenance.holidayProviderVersion,
        geographySource: calendar.provenance.geographySource,
      },
    },
    budgetDiagnostics: {
      sections: [],
      composedTextChars: 80,
      structuredChars: 80,
      composedTextTruncated: false,
      structuredTruncated: false,
    },
    composedText: "Harbor Clinic is a neighborhood dental clinic focused on preventive family care.",
  };
}

export function testMetadata(
  extras: Partial<SocialPlannerGenerationMetadata> = {},
): SocialPlannerGenerationMetadata {
  return {
    packageSchemaVersion: SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
    strategyPromptVersion: SOCIAL_PLANNER_STRATEGY_PROMPT_VERSION,
    assetPromptVersion: SOCIAL_PLANNER_ASSET_PROMPT_VERSION,
    repairPromptVersion: extras.repairUsed ? SOCIAL_PLANNER_REPAIR_PROMPT_VERSION : null,
    repairUsed: false,
    generationMode: "standard",
    provider: "openrouter",
    stages: [
      {
        pass: "strategy",
        athenaStage: "social_calendar_strategy",
        role: "premiumStrategicOutput",
        model: "anthropic/claude-sonnet-4",
        reasoningProfile: "EXECUTIVE",
        temperature: 0.2,
      },
    ],
    trendSocialPrompt: {
      key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      configured: true,
      revisionId: "trend-rev-1",
    },
    calendarResolverVersion: "social_planner_l2b_v1",
    calendarSchemaVersion: "social_calendar_context_v1",
    intelligenceComposerVersion: SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
    intelligenceSchemaVersion: SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
    ...extras,
  };
}

export const ALTERNATE_ASSET_PLAN: Array<{
  assetType: SocialPlannerAssetType;
  contentArchetype: SocialPlannerContentArchetype;
  primaryObjective: SocialPlannerObjective;
  platforms: SocialPlannerPlatform[];
  topic: string;
  hook: string;
}> = [
  {
    assetType: "infographic",
    contentArchetype: "data_point",
    primaryObjective: "educate",
    platforms: ["instagram", "linkedin"],
    topic: "insurance basics",
    hook: "Your plan probably already covers the visit you keep postponing.",
  },
  {
    assetType: "scenario_video",
    contentArchetype: "story",
    primaryObjective: "trust",
    platforms: ["tiktok", "instagram"],
    topic: "first cavity",
    hook: "The moment a parent hears cavity should not feel like a verdict.",
  },
  {
    assetType: "pdf_guide",
    contentArchetype: "how_to",
    primaryObjective: "build_authority",
    platforms: ["linkedin", "facebook"],
    topic: "retainer care",
    hook: "Retainers fail in the lunchbox long before they fail in the lab.",
  },
  {
    assetType: "question_post",
    contentArchetype: "question",
    primaryObjective: "engage",
    platforms: ["instagram", "threads"],
    topic: "weekend hours",
    hook: "Would Saturday mornings actually get used if we opened them?",
  },
  {
    assetType: "before_after",
    contentArchetype: "comparison",
    primaryObjective: "convert",
    platforms: ["instagram", "facebook"],
    topic: "whitening consult",
    hook: "Shade charts lie until someone explains the lighting.",
  },
  {
    assetType: "interview_or_qa_video",
    contentArchetype: "opinion",
    primaryObjective: "thought_leadership",
    platforms: ["youtube_shorts", "linkedin"],
    topic: "fluoride debate",
    hook: "The fluoride argument is louder than the actual science.",
  },
  {
    assetType: "cheat_sheet",
    contentArchetype: "checklist",
    primaryObjective: "nurture",
    platforms: ["facebook", "linkedin"],
    topic: "sports physicals",
    hook: "School sports paperwork always arrives the week before tryouts.",
  },
];

function productionSpecFor(assetType: SocialPlannerAssetType): SocialPlannerProductionSpec {
  if (assetType === "carousel") {
    return {
      kind: "carousel",
      visualDirection: "Warm clinic photography with clear typography",
      slideCount: 4,
      slides: [
        { index: 1, headline: "Overdue signs", body: "Bleeding floss is a signal.", visualNote: "Close-up sink" },
        { index: 2, headline: "Sensitivity", body: "Cold water sting is common.", visualNote: "Glass of water" },
        { index: 3, headline: "Crowding", body: "Floss catching means a visit.", visualNote: "Calendar" },
        { index: 4, headline: "Book a cleaning", body: "Ask for after-school hours.", visualNote: "Front desk" },
      ],
      designPrompt: "Soft daylight, Harbor Clinic warm neutrals, readable sans type, no invented logos.",
    };
  }
  if (
    assetType === "talking_head_video" ||
    assetType === "demonstration_video" ||
    assetType === "scenario_video" ||
    assetType === "interview_or_qa_video"
  ) {
    return {
      kind: "video",
      videoConcept: "Clinician speaks directly to camera in a real treatment room.",
      hook: "Open on a specific patient-time problem, not a slogan.",
      shotPlan: [
        { shot: 1, action: "Clinician faces camera and names the weekly problem.", framing: "Vertical medium close-up" },
        { shot: 2, action: "Show the real room detail that supports the claim.", framing: "Insert of workspace" },
        { shot: 3, action: "Return to camera with one practical next step.", framing: "Vertical medium" },
      ],
      dialogue: "Here is the actual reset we do between patients, and why it matters this week.",
      environment: "Real treatment room, daylight, no stock sci-fi lighting.",
      productionDirection: "Handheld-stable vertical video, natural voice, no captions inventing statistics.",
      visualTone: "Human, documentary, clinic-real",
    };
  }
  if (
    assetType === "checklist" ||
    assetType === "pdf_guide" ||
    assetType === "cheat_sheet"
  ) {
    return {
      kind: "document",
      documentConcept: "One-page first-visit checklist for parents.",
      sections: [
        { heading: "Before you arrive", content: "Insurance card, medication list, school pickup time." },
        { heading: "Questions to ask", content: "Ask about after-school openings and recall timing." },
        { heading: "After the visit", content: "Book the next cleaning before you leave." },
      ],
      designPrompt: "Clean one-page PDF, Harbor Clinic warm neutrals, large readable type.",
    };
  }
  if (assetType === "poll" || assetType === "question_post") {
    return {
      kind: "engagement",
      engagementType: assetType === "question_post" ? "question" : "poll",
      prompt:
        assetType === "question_post"
          ? "Would Saturday mornings actually get used if we opened them?"
          : "When is the easiest time for a cleaning?",
      options:
        assetType === "question_post"
          ? null
          : ["After school", "Saturday morning", "Lunch break"],
      visualSupport: "Simple branded story frame, no people required.",
    };
  }
  return {
    kind: "static",
    imagePrompt:
      "Photoreal neighborhood dental clinic, warm daylight, real reception materials, no futuristic AI glow.",
    composition: "Centered subject with generous negative space for a short overlay.",
    setting: "Harbor Clinic reception in late afternoon light.",
    subjects: assetType === "quote_visual" ? "No people; typography over a quiet interior" : "Optional staff in real uniforms",
    overlayCopyGuidance: "Short overlay only. No invented prices.",
    visualTone: "Warm, documentary, local",
  };
}

export function buildValidAsset(
  context: SocialPlannerGenerationContextV1,
  index: number,
  overrides: Partial<SocialCalendarAssetV1> = {},
  plan: (typeof ASSET_PLAN)[number] = ASSET_PLAN[index],
): Record<string, unknown> {
  const date = context.calendarContext.period.dates[index];
  const day = context.calendarContext.dayContexts[index];
  const personaId = context.personas.personas[index % Math.max(context.personas.personas.length, 1)]?.id;
  return {
    date,
    weekday: day.dayOfWeek,
    assetType: plan.assetType,
    contentArchetype: plan.contentArchetype,
    primaryObjective: plan.primaryObjective,
    audience: personaId ? `Persona ${personaId}` : "Local families",
    personaIds: personaId ? [personaId] : [],
    topic: plan.topic,
    angle: `${plan.topic} angle ${index + 1}`,
    hook: plan.hook,
    concept: `Harbor Clinic ${plan.topic} concept for ${date}.`,
    calendarAnchors: [],
    calendarReason: null,
    productionSpec: productionSpecFor(plan.assetType),
    socialCopy: `This week we are talking about ${plan.topic} for local families who need practical next steps.`,
    cta: plan.primaryObjective === "promote" || plan.primaryObjective === "convert" ? "Book a cleaning" : "Ask about after-school hours",
    recommendedPlatforms: plan.platforms,
    sourceSignals: [
      { type: "organization", id: TEST_ORG },
      ...(personaId ? [{ type: "persona", id: personaId }] : []),
    ],
    ...overrides,
  };
}

export function buildValidPackageRaw(
  context: SocialPlannerGenerationContextV1,
  assetOverrides?: Array<Partial<SocialCalendarAssetV1> | undefined>,
  plans: Array<(typeof ASSET_PLAN)[number]> = ASSET_PLAN,
): Record<string, unknown> {
  return {
    schemaVersion: SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
    strategySummary: "A balanced family-care week with education, personality, and one practical checklist.",
    whyThisWeekWorks:
      "This week balances authority, education and personality while speaking to two core customer groups. Midweek education builds trust, while the Friday video stays human. Calendar context is used only where it naturally supports the clinic offer.",
    assets: context.calendarContext.period.dates.map((_, index) =>
      buildValidAsset(context, index, assetOverrides?.[index], plans[index]),
    ),
  };
}

export function buildAlternatePackageRaw(
  context: SocialPlannerGenerationContextV1,
  assetOverrides?: Array<Partial<SocialCalendarAssetV1> | undefined>,
): Record<string, unknown> {
  return buildValidPackageRaw(context, assetOverrides, ALTERNATE_ASSET_PLAN);
}

export function buildValidatedPackage(
  context: SocialPlannerGenerationContextV1 = buildGenerationContext(),
  raw: Record<string, unknown> = buildValidPackageRaw(context),
  userGuidance: string | null = null,
): SocialCalendarPackageV1 {
  return validateAndNormalizeSocialCalendarPackage({
    raw,
    context,
    userGuidance,
    metadata: testMetadata(),
  });
}

export function buildHistoryRow(input: {
  id: string;
  createdAt: string;
  socialPackage?: SocialCalendarPackageV1 | Record<string, unknown> | null;
  organizationId?: string;
  status?: SocialCalendarStatus;
  generationMode?: SocialCalendarGenerationMode;
  periodStart?: string;
  periodEnd?: string;
}): SocialPlannerHistoryRow {
  return {
    id: input.id,
    organization_id: input.organizationId ?? TEST_ORG,
    period_start: input.periodStart ?? TEST_PERIOD_START,
    period_end: input.periodEnd ?? TEST_PERIOD_END,
    generation_mode: input.generationMode ?? "standard",
    version_number: 1,
    status: input.status ?? "Ready",
    package_json: (input.socialPackage ?? null) as SocialCalendarPackageJson | null,
    created_at: input.createdAt,
  };
}

export function buildValidStrategyRaw(
  context: SocialPlannerGenerationContextV1,
): Record<string, unknown> {
  return {
    schemaVersion: SOCIAL_PLANNER_WEEKLY_STRATEGY_SCHEMA_VERSION,
    weeklyObjective: "Build trust and book hygiene visits without a hard sell.",
    secondaryObjectives: ["Rotate two family audiences", "Use Mother's Day only if relevant"],
    audiencePlan: context.personas.personas.slice(0, 2).map((row, index) => ({
      audience: row.audienceSegment ?? row.name,
      personaId: row.id,
      role: index === 0 ? "primary" : "secondary",
    })),
    topicPlan: [
      { topic: "preventive care", rationale: "Core service" },
      { topic: "evening hours", rationale: "Known pain point" },
    ],
    formatPlan: context.calendarContext.period.dates.map((date, index) => ({
      date,
      assetType: ASSET_PLAN[index].assetType,
      contentArchetype: ASSET_PLAN[index].contentArchetype,
      primaryObjective: ASSET_PLAN[index].primaryObjective,
    })),
    calendarOpportunityPlan: { selected: [], ignored: [] },
    contentBalance: {
      promotionalWeight: "low",
      educationalWeight: "high",
      communityWeight: "moderate",
      funnelNotes: "Lead with education, close with a soft booking ask.",
    },
    narrativeArc: "Start useful, get more human midweek, end with community proof.",
    creativeDirection: "Warm, local, documentary. Avoid generic AI-tech imagery.",
    avoidances: ["Invented prices", "Copied ad slogans"],
    userGuidanceInterpretation: null,
  };
}

export function firstHolidayCandidate(context: SocialPlannerGenerationContextV1) {
  return context.calendarContext.opportunities.find((opportunity) =>
    [
      "public_holiday",
      "civic_observance",
      "cultural_religious_observance",
      "commercial_event",
      "awareness_event",
      "seasonal_event",
    ].includes(opportunity.category),
  );
}

export function ensureUsHolidayCandidate(
  context: SocialPlannerGenerationContextV1,
) {
  const existing = firstHolidayCandidate(context);
  if (existing) return existing;
  const date = context.calendarContext.period.dates[0];
  const fallback = {
    id: `test-mothers-day:${date}`,
    label: "Mother's Day",
    date,
    category: "commercial_event" as const,
    scope: "country" as const,
    jurisdictionCountryCode: "US",
    jurisdictionRegionCode: null,
    jurisdictionHemisphere: null,
    selectionStatus: "candidate" as const,
    ruleId: "test-mothers-day",
    observedKind: "actual" as const,
    providerRule: "test",
  };
  context.calendarContext.opportunities.push(fallback);
  const day = context.calendarContext.dayContexts.find((entry) => entry.date === date);
  if (day && !day.opportunityIds.includes(fallback.id)) {
    day.opportunityIds.push(fallback.id);
  }
  return fallback;
}
