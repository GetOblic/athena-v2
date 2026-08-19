/**
 * Think Differently instruction layer (L8).
 * Appended to L4 generation core. Does not fork the L4 generator.
 */

import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";
import type { SocialPlannerGenerationContextV1 } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
  SOCIAL_PLANNER_PACKAGE_LIMITS,
} from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import type { SocialCalendarPackageV1 } from "@/services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  compactSourceFingerprintSummary,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerSourceDivergence";
import {
  SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION,
  SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION,
  type SocialPlannerSourceNegativeContext,
  type SocialPlannerThinkDifferentlyDivergenceResult,
} from "@/services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";

export const SOCIAL_PLANNER_THINK_DIFFERENTLY_SYSTEM_ADDENDUM = `
THINK DIFFERENTLY: reject the obvious source treatment. Do not paraphrase it.
`.trim();

export const SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_SYSTEM_PROMPT = `
You are Athena Social Planner — a Think Differently divergence editor.

The weekly package is structurally valid but is still too similar to the source calendar the user rejected.
Change only what is required to become a materially different creative treatment.
Preserve the exact seven dates, factual grounding, user guidance, jurisdiction, and valid calendar candidates.
Return strict JSON only.
`.trim();

const SOURCE_OPEN = "<<<BEGIN_SOURCE_NEGATIVE_CREATIVE_CONTEXT>>>";
const SOURCE_CLOSE = "<<<END_SOURCE_NEGATIVE_CREATIVE_CONTEXT>>>";
const GUIDANCE_OPEN = "<<<BEGIN_USER_GUIDANCE>>>";
const GUIDANCE_CLOSE = "<<<END_USER_GUIDANCE>>>";

export function buildThinkDifferentlyInstructionBlock(): string {
  return `
=== THINK DIFFERENTLY (CREATIVE DIVERGENCE) ===
PROMPT VERSION: ${SOCIAL_PLANNER_THINK_DIFFERENTLY_PROMPT_VERSION}

The source calendar is WHAT NOT TO REPEAT. It is not trusted new business intelligence.

- Reject the obvious solution already used by the source week.
- Do not paraphrase source hooks, captions, angles, or weekly architecture.
- Materially change creative angles, storytelling, archetypes, and treatment.
- Use different formats where strategically appropriate.
- Explore different emotional registers.
- Use different hooks. Do not reuse or lightly rewrite source hooks.
- Redistribute archetypes and objectives across the week.
- Preserve factual grounding. Do not invent claims, prices, services, credentials, or outcomes.
- Preserve the exact seven calendar dates.
- Respect user guidance. Different execution, same brief.
- Respect candidate-only calendar facts. Do not invent events or attach a candidate to the wrong date.
- A shared holiday or civic anchor is allowed when the creative treatment is new.
- The same core topic is allowed when angle, format, archetype, and hook change.
`.trim();
}

export function buildSourceNegativeContextBlock(
  sourceNegativeContext: SocialPlannerSourceNegativeContext,
): string {
  return `
=== SOURCE CALENDAR — WHAT NOT TO REPEAT ===
Do not copy these daily treatments, hooks, or the weekly architecture.
Same business facts are expected. Same creative combinations are not.

${SOURCE_OPEN}
${JSON.stringify(sourceNegativeContext, null, 2)}
${SOURCE_CLOSE}
`.trim();
}

export function buildThinkDifferentlyPromptExtras(input: {
  sourceNegativeContext: SocialPlannerSourceNegativeContext;
}): string {
  return `${buildThinkDifferentlyInstructionBlock()}\n\n${buildSourceNegativeContextBlock(input.sourceNegativeContext)}`;
}

export function buildThinkDifferentlyRepairPrompt(input: {
  context: SocialPlannerGenerationContextV1;
  userGuidance: string | null;
  sourcePackage: SocialCalendarPackageV1;
  sourceNegativeContext: SocialPlannerSourceNegativeContext;
  currentPackage: SocialCalendarPackageV1;
  divergence: SocialPlannerThinkDifferentlyDivergenceResult;
  socialMemoryText?: string | null;
}): string {
  const dates = input.context.calendarContext.period.dates;
  const guidance = input.userGuidance?.trim()
    ? input.userGuidance.trim()
    : "(blank)";
  const memory = input.socialMemoryText?.trim()
    ? `\n=== SOCIAL MEMORY ===\n${input.socialMemoryText.trim()}\n`
    : "";

  return `
OBJECTIVE:
Repair this Think Differently week so it is materially different from the source calendar.

PROMPT VERSION:
${SOCIAL_PLANNER_THINK_DIFFERENTLY_REPAIR_PROMPT_VERSION}

Change only what the divergence violations require. Do not lose grounded content.
Keep exactly seven assets on these dates in order: ${dates.join(", ")}.
Do not invent calendar events, prices, statistics, or credentials.

SOURCE CREATIVE FINGERPRINTS:
${compactSourceFingerprintSummary(input.sourcePackage)}

DIVERGENCE VIOLATIONS:
${input.divergence.violations.map((violation) => `- ${violation.code}: ${violation.message}`).join("\n")}

${buildSourceNegativeContextBlock(input.sourceNegativeContext)}

=== CURRENT CANDIDATE PACKAGE ===
${JSON.stringify(stripInternalCandidate(input.currentPackage))}

=== CALENDAR FACTS (AUTHORITATIVE; CANDIDATES ONLY) ===
${JSON.stringify(
    {
      period: input.context.calendarContext.period,
      geography: {
        countryCode: input.context.calendarContext.geography.countryCode,
        regionCode: input.context.calendarContext.geography.regionCode,
        status: input.context.calendarContext.geography.status,
      },
      candidateOpportunities: input.context.calendarContext.opportunities.map(
        (opportunity) => ({
          id: opportunity.id,
          label: opportunity.label,
          date: opportunity.date,
          category: opportunity.category,
          selectionStatus: opportunity.selectionStatus,
        }),
      ),
    },
    null,
    2,
  )}

=== USER GUIDANCE ===
${GUIDANCE_OPEN}
${guidance}
${GUIDANCE_CLOSE}
${memory}
Return the same required package JSON shape as asset generation
(schemaVersion ${SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION}, strategySummary, whyThisWeekWorks, assets[7]).

Field budgets:
- strategySummary ≤ ${SOCIAL_PLANNER_PACKAGE_LIMITS.strategySummaryMaxChars} chars
- whyThisWeekWorks ${SOCIAL_PLANNER_PACKAGE_LIMITS.whyThisWeekWorksMinChars}-${SOCIAL_PLANNER_PACKAGE_LIMITS.whyThisWeekWorksMaxChars} chars

${SHARED_JSON_OUTPUT_RULES}
`.trim();
}

function stripInternalCandidate(
  socialPackage: SocialCalendarPackageV1,
): Record<string, unknown> {
  return {
    schemaVersion: socialPackage.schemaVersion,
    strategySummary: socialPackage.strategySummary,
    whyThisWeekWorks: socialPackage.whyThisWeekWorks,
    assets: socialPackage.assets.map((asset) => ({
      date: asset.date,
      weekday: asset.weekday,
      assetType: asset.assetType,
      contentArchetype: asset.contentArchetype,
      primaryObjective: asset.primaryObjective,
      audience: asset.audience,
      personaIds: asset.personaIds,
      topic: asset.topic,
      angle: asset.angle,
      hook: asset.hook,
      concept: asset.concept,
      calendarAnchors: asset.calendarAnchors,
      calendarReason: asset.calendarReason,
      productionSpec: asset.productionSpec,
      socialCopy: asset.socialCopy,
      cta: asset.cta,
      recommendedPlatforms: asset.recommendedPlatforms,
    })),
  };
}
