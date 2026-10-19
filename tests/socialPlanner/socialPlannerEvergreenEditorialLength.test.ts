import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SocialCalendarOpportunity } from "../../services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
  type SocialPlannerConversationRevisionContextV1,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import { SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerStrategyValidationError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import { generateEvergreenSocialCalendarPackage } from "../../services/socialPlanner/generation/generateEvergreenSocialCalendarPackage";
import { planEvergreenWeekFormats } from "../../services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  validateAndNormalizeSocialCalendarEvergreenPackage,
  validateSocialPlannerEvergreenWeeklyStrategy,
  SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
} from "../../services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import {
  validateAndNormalizeSocialCalendarPackage,
  validateSocialPlannerWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import type { SocialPlannerGenerationContextV1 } from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  ensureUsHolidayCandidate,
  mockEvergreenGenerationResponse,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function repeatTo(text: string, minChars: number): string {
  let value = text;
  while (value.length < minChars) value += text;
  return value;
}

function proseDraft(seed: string): string {
  return [
    `${seed} opens with a specific Harbor Clinic observation about delayed preventive care.`,
    "Parents wait until a small problem becomes urgent, usually after a school event or a weekend that finally leaves room.",
    "This draft gives a manager a usable piece they can edit today, not a suggestion to start writing later.",
    "The first movement names the delay. The second movement shows the calmer first conversation.",
    "The third movement offers one evening slot, one Saturday slot, and a written reminder the parent can keep.",
    "Close with a restrained next step. Keep the language local and useful.",
    "Parents can keep one written reminder and book one evening slot before the school week closes. The same reminder names the overdue visit, the pickup window, and the cost of waiting another month.",
  ].join("\n\n");
}

function courseDraft(seed: string): string {
  return [
    proseDraft(seed),
    "Course name: Preventive Care Confidence.",
    "Learner outcome: Operators can run a calmer first-visit conversation.",
    "Module 1: The delayed-care pattern.",
    "Module 2: The first-visit script.",
    "Module 3: The follow-up habit.",
  ].join("\n\n");
}

function evergreenMetadata() {
  return {
    ...testMetadata(),
    packageSchemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen" as const,
    strategyPromptVersion: "social_planner_evergreen_strategy_v1",
    assetPromptVersion: "social_planner_evergreen_v1",
  };
}

function evergreenStrategyRaw(
  context = buildGenerationContext(),
  overrides: Record<string, unknown> = {},
) {
  const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
  return {
    schemaVersion: SOCIAL_PLANNER_EVERGREEN_WEEKLY_STRATEGY_SCHEMA_VERSION,
    weeklyObjective: "Teach delayed preventive care through durable formats.",
    secondaryObjectives: ["build_authority"],
    audiencePlan: [
      { audience: "Busy parents", personaId: "persona-parent", role: "primary" },
    ],
    topicPlan: [{ topic: "delayed care", rationale: "Supported by clinic context." }],
    formatPlan: assigned.map((entry) => ({
      date: entry.date,
      evergreenFormat: entry.evergreenFormat,
      contentArchetype: "educational",
      primaryObjective: "educate",
    })),
    calendarOpportunityPlan: { selected: [], ignored: [] },
    contentBalance: {
      promotionalWeight: "low",
      educationalWeight: "high",
      communityWeight: "moderate",
      funnelNotes: "Teach first.",
    },
    narrativeArc: "Move from the delay pattern to a usable next step.",
    creativeDirection: "Plain, local, useful.",
    avoidances: ["Daily social copy"],
    userGuidanceInterpretation: null,
    strategySummary:
      "A durable Harbor Clinic week that rotates Blog, Newsletter, Substack, Reddit, and Skool.",
    whyThisWeekWorks:
      "This week teaches one preventive-care idea through six durable formats. Each day is a working draft a manager can edit.",
    ...overrides,
  };
}

function evergreenPackageRaw(context = buildGenerationContext()) {
  const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
  return {
    schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen",
    strategySummary:
      "A durable Harbor Clinic week that rotates Blog, Newsletter, Substack, Reddit, and Skool.",
    whyThisWeekWorks:
      "This week teaches one preventive-care idea through six durable formats. Each day is a working draft a manager can edit.",
    days: assigned.map((assignment, index) => ({
      date: assignment.date,
      evergreenFormat: assignment.evergreenFormat,
      title: `Harbor ${assignment.evergreenFormat} ${index + 1}`,
      concept: `Angle ${index + 1} for delayed preventive care.`,
      draft:
        assignment.evergreenFormat === "skool_course_idea"
          ? courseDraft(`Day ${index + 1}`)
          : proseDraft(`Day ${index + 1}`),
      cta: "Invite the family to book the overdue visit.",
      publishingGuidance: "Publish in the native format.",
      audience: "Busy parents",
      personaIds: ["persona-parent"],
      topic: `preventive care ${index + 1}`,
      angle: `practical delay ${index + 1}`,
      contentArchetype: "educational",
      primaryObjective: "educate",
      calendarAnchors: [] as Array<Record<string, unknown>>,
      calendarReason: null as string | null,
      sourceSignals: [{ type: "brain", id: null }],
    })),
  };
}

function holidayOpportunity(
  date: string,
  countryCode: string,
  label: string,
): SocialCalendarOpportunity {
  return {
    id: `test-holiday:${countryCode}:${date}`,
    label,
    date,
    category: "civic_observance",
    scope: "country",
    jurisdictionCountryCode: countryCode,
    jurisdictionRegionCode: null,
    jurisdictionHemisphere: null,
    selectionStatus: "candidate",
    ruleId: "test-holiday",
    observedKind: "actual",
    providerRule: "test",
  };
}

function validatePackage(
  raw: Record<string, unknown>,
  context = buildGenerationContext(),
) {
  return validateAndNormalizeSocialCalendarEvergreenPackage({
    raw,
    context,
    metadata: evergreenMetadata(),
    assignedFormats: planEvergreenWeekFormats(context.calendarContext.period.dates),
  });
}

function packageFailures(
  raw: Record<string, unknown>,
  context = buildGenerationContext(),
): string[] {
  try {
    validatePackage(raw, context);
  } catch (error) {
    assert.ok(error instanceof SocialCalendarPackageValidationError);
    return error.failures;
  }
  assert.fail("expected Evergreen package validation to fail");
}

function strategyFailures(
  raw: Record<string, unknown>,
  context = buildGenerationContext(),
): string[] {
  try {
    validateSocialPlannerEvergreenWeeklyStrategy(
      raw,
      context,
      planEvergreenWeekFormats(context.calendarContext.period.dates),
    );
  } catch (error) {
    assert.ok(error instanceof SocialPlannerStrategyValidationError);
    return error.failures;
  }
  assert.fail("expected Evergreen strategy validation to fail");
}

function revisionContext(
  context = buildGenerationContext(),
): SocialPlannerConversationRevisionContextV1 {
  const dates = context.calendarContext.period.dates;
  return {
    schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
    appliedAt: "2026-08-20T12:00:00.000Z",
    brief: {
      schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
      sourceCalendarId: "cal-evergreen-v1",
      conversationMessageCount: 2,
      latestUserMessageId: "msg-user-1",
      latestUserMessageAt: "2026-08-20T12:00:00.000Z",
      actionable: true,
      global: { changeSummary: "Keep the week, sharpen the drafts." },
      dayChanges: [
        {
          date: dates[6],
          requestedChangeSummary: "Let the Saturday draft explain the calendar reason in full.",
        },
      ],
      preserve: dates.slice(0, 6),
      avoid: [],
    },
  };
}

describe("Evergreen editorial length", () => {
  it("accepts overlong creative narratives and keeps the full trimmed wording", () => {
    const context = buildGenerationContext();
    const candidate = ensureUsHolidayCandidate(context);
    const holidayIndex = context.calendarContext.period.dates.indexOf(candidate.date);
    assert.ok(holidayIndex >= 0);
    const raw = evergreenPackageRaw(context);
    const calendarReason = `  ${repeatTo(
      "Parents can use this observance as a calm reminder to book the overdue visit. ",
      320,
    )}UNIQUE_CALENDAR_REASON_TAIL  `;
    const anchorReason = `  ${repeatTo(
      "The date supports a practical family-care reminder without inventing a new holiday. ",
      320,
    )}UNIQUE_ANCHOR_REASON_TAIL  `;
    const title = `  ${repeatTo("Harbor draft title for delayed preventive care. ", 220)}UNIQUE_TITLE_TAIL  `;
    const concept = `  ${repeatTo(
      "The concept stays with the delay pattern and the first usable conversation. ",
      650,
    )}UNIQUE_CONCEPT_TAIL  `;
    const cta = `  ${repeatTo(
      "Invite the family to book the overdue visit this week. ",
      320,
    )}UNIQUE_CTA_TAIL  `;
    const topic = repeatTo("preventive care after a school week ", 260);
    const angle = repeatTo("practical delay before the visit ", 260);
    const audience = repeatTo("Busy parents who wait for a school break ", 240);
    const publishingGuidance = repeatTo(
      "Publish the native draft and leave the calendar explanation intact. ",
      850,
    );
    const strategySummary = `  ${repeatTo(
      "A durable week of working drafts for delayed preventive care. ",
      560,
    )}UNIQUE_STRATEGY_SUMMARY_TAIL  `;
    const whyThisWeekWorks = `  ${repeatTo(
      "This week works because each draft is usable on its own. ",
      760,
    )}UNIQUE_WHY_TAIL  `;
    const draftUnit = "Parents can keep one written reminder and book one evening slot. ";
    let overlongDraft = proseDraft("Overlong draft");
    while (overlongDraft.length < 12_050) {
      overlongDraft += `\n\n${draftUnit.repeat(4)}`;
    }
    overlongDraft += "UNIQUE_DRAFT_TAIL";

    assert.ok(calendarReason.trim().length > 280);
    assert.ok(anchorReason.trim().length > 280);
    assert.ok(title.trim().length > 200);
    assert.ok(concept.trim().length > 600);
    assert.ok(cta.trim().length > 280);
    assert.ok(topic.length > 240);
    assert.ok(angle.length > 240);
    assert.ok(audience.length > 220);
    assert.ok(publishingGuidance.length > 800);
    assert.ok(strategySummary.trim().length > 500);
    assert.ok(whyThisWeekWorks.trim().length > 700);
    assert.ok(overlongDraft.length > 12_000);
    assert.equal(whyThisWeekWorks.trim().split(/(?<=[.!?])\s+/).length > 4, true);

    raw.strategySummary = strategySummary;
    raw.whyThisWeekWorks = whyThisWeekWorks;
    const incidentDay = raw.days[6];
    incidentDay.calendarReason = calendarReason;
    incidentDay.title = title;
    incidentDay.concept = concept;
    incidentDay.cta = cta;
    incidentDay.topic = topic;
    incidentDay.angle = angle;
    incidentDay.audience = audience;
    incidentDay.publishingGuidance = publishingGuidance;
    raw.days[1].draft = overlongDraft;

    const anchorDay = raw.days[holidayIndex];
    anchorDay.calendarAnchors = [
      {
        sourceCandidateId: candidate.id,
        date: candidate.date,
        label: candidate.label,
        category: candidate.category,
        scope: candidate.scope,
        reason: anchorReason,
      },
    ];

    const validated = validatePackage(raw, context);
    assert.equal(validated.days.length, 7);
    assert.equal(validated.days[6].calendarReason, calendarReason.trim());
    assert.equal(validated.days[6].title, title.trim());
    assert.equal(validated.days[6].concept, concept.trim());
    assert.equal(validated.days[6].cta, cta.trim());
    assert.equal(validated.days[6].topic, topic.trim());
    assert.equal(validated.days[6].angle, angle.trim());
    assert.equal(validated.days[6].audience, audience.trim());
    assert.equal(validated.days[6].publishingGuidance, publishingGuidance.trim());
    assert.equal(validated.strategySummary, strategySummary.trim());
    assert.equal(validated.whyThisWeekWorks, whyThisWeekWorks.trim());
    assert.equal(validated.days[1].draft, overlongDraft);
    assert.equal(
      validated.days[holidayIndex].calendarAnchors[0]?.reason,
      anchorReason.trim(),
    );
    assert.equal(
      validated.days[holidayIndex].calendarAnchors[0]?.sourceCandidateId,
      candidate.id,
    );
    assert.ok(validated.days[6].calendarReason?.includes("UNIQUE_CALENDAR_REASON_TAIL"));
    assert.ok(validated.days[6].title.includes("UNIQUE_TITLE_TAIL"));
    assert.ok(validated.days[6].concept.includes("UNIQUE_CONCEPT_TAIL"));
    assert.ok(validated.days[6].cta?.includes("UNIQUE_CTA_TAIL"));
    assert.ok(validated.strategySummary.includes("UNIQUE_STRATEGY_SUMMARY_TAIL"));
    assert.ok(validated.whyThisWeekWorks.includes("UNIQUE_WHY_TAIL"));
    assert.ok(validated.days[1].draft.includes("UNIQUE_DRAFT_TAIL"));
    assert.ok(
      validated.days[holidayIndex].calendarAnchors[0]?.reason.includes(
        "UNIQUE_ANCHOR_REASON_TAIL",
      ),
    );
  });

  it("accepts a short single-sentence whyThisWeekWorks", () => {
    const context = buildGenerationContext();
    const raw = evergreenPackageRaw(context);
    raw.whyThisWeekWorks = "One usable draft is enough.";
    assert.ok(raw.whyThisWeekWorks.length < 80);
    const validated = validatePackage(raw, context);
    assert.equal(validated.whyThisWeekWorks, "One usable draft is enough.");
  });

  it("accepts overlong strategy narratives and keeps the full trimmed wording", () => {
    const context = buildGenerationContext();
    const weeklyObjective = `  ${repeatTo(
      "Teach delayed preventive care through durable formats. ",
      320,
    )}UNIQUE_WEEKLY_OBJECTIVE_TAIL  `;
    const creativeDirection = `  ${repeatTo(
      "Plain, local, and useful for a manager who will edit the draft. ",
      450,
    )}UNIQUE_CREATIVE_DIRECTION_TAIL  `;
    const narrativeArc = `  ${repeatTo(
      "Move from the delay pattern to one usable next step. ",
      650,
    )}UNIQUE_NARRATIVE_ARC_TAIL  `;
    assert.ok(weeklyObjective.trim().length > 280);
    assert.ok(creativeDirection.trim().length > 400);
    assert.ok(narrativeArc.trim().length > 600);
    const strategy = validateSocialPlannerEvergreenWeeklyStrategy(
      evergreenStrategyRaw(context, {
        weeklyObjective,
        creativeDirection,
        narrativeArc,
      }),
      context,
      planEvergreenWeekFormats(context.calendarContext.period.dates),
    );
    assert.equal(strategy.weeklyObjective, weeklyObjective.trim());
    assert.equal(strategy.creativeDirection, creativeDirection.trim());
    assert.equal(strategy.narrativeArc, narrativeArc.trim());
  });

  it("does not call repair when the only former problem is editorial length", async () => {
    const context = buildGenerationContext();
    const strategyRaw = evergreenStrategyRaw(context, {
      weeklyObjective: repeatTo("Teach the delay pattern through a usable draft. ", 400),
      creativeDirection: repeatTo("Keep the language plain and local. ", 500),
      narrativeArc: repeatTo("Start with the delay and end with one next step. ", 700),
    });
    const packageRaw = evergreenPackageRaw(context);
    packageRaw.days[6].calendarReason = repeatTo(
      "Saturday carries the full calendar explanation for the overdue visit. ",
      400,
    );
    packageRaw.days[6].title = repeatTo("Saturday Harbor draft ", 250);
    packageRaw.days[6].concept = repeatTo("Concept for the overdue visit. ", 700);
    packageRaw.days[6].cta = repeatTo("Book the overdue visit. ", 320);
    const stages: string[] = [];
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: strategyRaw,
            days: packageRaw.days,
          });
        },
      },
    });
    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
    ]);
    assert.equal(generated.package.generationMetadata.repairUsed, false);
    assert.equal(
      generated.package.days[6].calendarReason,
      String(packageRaw.days[6].calendarReason).trim(),
    );
    assert.equal(generated.package.days[6].title, packageRaw.days[6].title.trim());
    assert.equal(generated.package.days[6].cta, String(packageRaw.days[6].cta).trim());
    assert.equal(
      generated.package.days[6].calendarReason?.endsWith("visit."),
      true,
    );
  });

  it("still repairs a structurally invalid package", async () => {
    const context = buildGenerationContext();
    const invalid = evergreenPackageRaw(context);
    invalid.days[0].draft = [
      "Write a blog about preventive care.",
      "Consider a newsletter next.",
      "Talk about school calendars.",
      "Idea: mention Saturday hours.",
      "Suggest a follow-up reminder.",
    ].join("\n");
    const repaired = evergreenPackageRaw(context);
    const stages: string[] = [];
    const generated = await generateEvergreenSocialCalendarPackage({
      context,
      generationMode: "standard",
      deps: {
        generateReview: async (prompt, options) => {
          const stage = String(options?.stage ?? "");
          stages.push(stage);
          return mockEvergreenGenerationResponse({
            prompt,
            stage,
            strategy: evergreenStrategyRaw(context),
            days: stage.includes("repair") ? repaired.days : invalid.days,
          });
        },
      },
    });
    assert.deepEqual(stages, [
      "socialPlanner.evergreen.strategy",
      "socialPlanner.evergreen.assets",
      "socialPlanner.evergreen.repair",
    ]);
    assert.equal(generated.package.generationMetadata.repairUsed, true);
    assert.equal(generated.package.days[0].draft, repaired.days[0].draft);
  });

  it("rejects an unknown anchor, a wrong anchor date, and a foreign geography", () => {
    const unknownContext = buildGenerationContext();
    const unknown = evergreenPackageRaw(unknownContext);
    unknown.days[0].calendarAnchors = [
      {
        sourceCandidateId: "invented-christmas:2026-05-10",
        date: unknownContext.calendarContext.period.dates[0],
        label: "Christmas",
        category: "public_holiday",
        scope: "global",
        reason: "Model memory",
      },
    ];
    assert.ok(
      packageFailures(unknown, unknownContext).some((failure) =>
        /unknown calendar opportunity/i.test(failure),
      ),
    );

    const wrongDayContext = buildGenerationContext();
    const candidate = ensureUsHolidayCandidate(wrongDayContext);
    const wrongIndex = wrongDayContext.calendarContext.period.dates.findIndex(
      (date) => date !== candidate.date,
    );
    const wrongDay = evergreenPackageRaw(wrongDayContext);
    wrongDay.days[wrongIndex].calendarAnchors = [
      {
        sourceCandidateId: candidate.id,
        date: candidate.date,
        label: candidate.label,
        category: candidate.category,
        scope: candidate.scope,
        reason: "Wrong day",
      },
    ];
    assert.ok(
      packageFailures(wrongDay, wrongDayContext).some((failure) =>
        /cannot attach/i.test(failure),
      ),
    );

    const foreignContext = buildGenerationContext();
    const foreign = holidayOpportunity(
      foreignContext.calendarContext.period.dates[1],
      "GB",
      "Bank Holiday",
    );
    foreignContext.calendarContext.opportunities.push(foreign);
    const foreignPackage = evergreenPackageRaw(foreignContext);
    foreignPackage.days[1].calendarAnchors = [
      {
        sourceCandidateId: foreign.id,
        date: foreign.date,
        label: foreign.label,
        category: foreign.category,
        scope: foreign.scope,
        reason: "Foreign",
      },
    ];
    assert.ok(
      packageFailures(foreignPackage, foreignContext).some((failure) =>
        /outside the trusted jurisdiction/i.test(failure),
      ),
    );
  });

  it("rejects missing content, the wrong type, an outline-only draft, and a course draft without structure", () => {
    const context = buildGenerationContext();
    const missingTitle = evergreenPackageRaw(context);
    delete (missingTitle.days[6] as { title?: unknown }).title;
    assert.ok(
      packageFailures(missingTitle, context).includes("days[6].title is required."),
    );

    const wrongType = evergreenPackageRaw(context);
    (wrongType.days[0] as { concept: unknown }).concept = 12;
    assert.ok(
      packageFailures(wrongType, context).includes("days[0].concept must be a string."),
    );

    const emptyAudience = evergreenPackageRaw(context);
    emptyAudience.days[2].audience = "   ";
    assert.ok(
      packageFailures(emptyAudience, context).includes(
        "days[2].audience must not be empty.",
      ),
    );

    const shortDraft = evergreenPackageRaw(context);
    shortDraft.days[0].draft = [
      "Parents delay preventive care until a school week finally opens.",
      "The first conversation should name the overdue visit without pressure.",
      "Offer one evening slot and one Saturday slot.",
      "Close with a written reminder the parent can keep.",
    ].join("\n\n");
    assert.ok(shortDraft.days[0].draft.length < 700);
    assert.ok(
      packageFailures(shortDraft, context).some((failure) =>
        /days\[0\]\.draft must be a usable blog_post_idea draft of at least 700 characters/.test(
          failure,
        ),
      ),
    );

    const outline = evergreenPackageRaw(context);
    outline.days[0].draft = [
      "Write a blog about preventive care.",
      "Consider a newsletter next.",
      "Talk about school calendars.",
      "Idea: mention Saturday hours.",
      "Suggest a follow-up reminder.",
    ].join("\n");
    assert.ok(
      packageFailures(outline, context).some((failure) =>
        /not an outline or list of suggestions/.test(failure),
      ),
    );

    const courseIndex = evergreenPackageRaw(context).days.findIndex(
      (day) => day.evergreenFormat === "skool_course_idea",
    );
    assert.ok(courseIndex >= 0);
    const unstructured = evergreenPackageRaw(context);
    unstructured.days[courseIndex].draft = proseDraft("Course day");
    assert.ok(
      packageFailures(unstructured, context).some((failure) =>
        /course\/module structure and a learner outcome/.test(failure),
      ),
    );

    assert.ok(
      strategyFailures(
        evergreenStrategyRaw(context, { narrativeArc: "   " }),
        context,
      ).includes("narrativeArc must not be empty."),
    );
    assert.ok(
      strategyFailures(
        evergreenStrategyRaw(context, { creativeDirection: 400 }),
        context,
      ).includes("creativeDirection must be a string."),
    );
  });

  it("still rejects a day that exceeds the JSON size budget", () => {
    const context = buildGenerationContext();
    const raw = evergreenPackageRaw(context);
    const unit = "Parents can keep one written reminder and one evening slot. ";
    let body = "";
    while (body.length < 17_000) body += unit;
    raw.days[3].draft = [
      body,
      "Second movement names the delay.",
      "Third movement offers a Saturday slot.",
      "Fourth movement closes with a written reminder.",
    ].join("\n\n");
    const failures = packageFailures(raw, context);
    assert.ok(
      failures.some((failure) => /exceeds the 16000 character budget/.test(failure)),
    );
    assert.equal(
      failures.some((failure) => /draft exceeds|draftMaxChars/.test(failure)),
      false,
    );
  });

  it("still rejects a mistargeted persona and a Prospect name in the package", () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const retireeId = "22222222-2222-4222-8222-222222222222";
    const context = buildGenerationContext();
    context.personas.personas[0].id = parentId;
    context.personas.personas[1].id = retireeId;
    const targeted = {
      ...context,
      primaryTargetAudience: { name: "Busy Parent" },
      authorizedTargetPersonaId: parentId,
    } as SocialPlannerGenerationContextV1;
    const wrongPersona = evergreenPackageRaw(targeted);
    for (const day of wrongPersona.days) day.personaIds = [parentId];
    wrongPersona.days[0].personaIds = [retireeId];
    assert.ok(
      packageFailures(wrongPersona, targeted).some((failure) =>
        /must contain only the targeted Audience/.test(failure),
      ),
    );

    const leaked = evergreenPackageRaw(context);
    leaked.strategySummary = "Hidden Dental Group LLC should stay out of this week.";
    assert.ok(
      packageFailures(leaked, context).some((failure) =>
        /must not expose Prospect identifiers/.test(failure),
      ),
    );
  });

  it("keeps Evergreen Think Differently and conversation revision compatible with overlong copy", async () => {
    const context = buildGenerationContext();
    const source = validatePackage(evergreenPackageRaw(context), context);
    const strategyRaw = evergreenStrategyRaw(context, {
      weeklyObjective: repeatTo("Teach the delay through a different durable draft. ", 360),
      narrativeArc: repeatTo("Change the story and keep the assigned formats. ", 680),
    });
    const packageRaw = evergreenPackageRaw(context);
    packageRaw.days[6].calendarReason = repeatTo(
      "The revised Saturday draft keeps the full calendar explanation. ",
      360,
    );
    packageRaw.whyThisWeekWorks = "One sentence explains the revised week.";
    strategyRaw.whyThisWeekWorks = packageRaw.whyThisWeekWorks;

    for (const generationMode of ["think_differently", "conversation_revision"] as const) {
      const stages: string[] = [];
      const generated = await generateEvergreenSocialCalendarPackage({
        context,
        generationMode,
        sourcePackage: source,
        revisionContext:
          generationMode === "conversation_revision" ? revisionContext(context) : null,
        deps: {
          generateReview: async (prompt, options) => {
            const stage = String(options?.stage ?? "");
            stages.push(stage);
            return mockEvergreenGenerationResponse({
              prompt,
              stage,
              strategy: strategyRaw,
              days: packageRaw.days,
            });
          },
        },
      });
      assert.deepEqual(stages, [
        "socialPlanner.evergreen.strategy",
        "socialPlanner.evergreen.assets",
      ]);
      assert.equal(generated.package.generationMetadata.generationMode, generationMode);
      assert.equal(generated.package.generationMetadata.repairUsed, false);
      assert.equal(
        generated.package.days[6].calendarReason,
        String(packageRaw.days[6].calendarReason).trim(),
      );
      assert.ok(
        generated.package.days[6].calendarReason?.includes(
          "The revised Saturday draft keeps the full calendar explanation.",
        ),
      );
      assert.equal(generated.package.whyThisWeekWorks, packageRaw.whyThisWeekWorks);
    }
  });

  it("leaves Daily Social Planner length rules in place", () => {
    const context = buildGenerationContext();
    const candidate = ensureUsHolidayCandidate(context);
    const dayIndex = context.calendarContext.period.dates.indexOf(candidate.date);
    const dailyOverrides: Array<Record<string, unknown> | undefined> = [];
    dailyOverrides[dayIndex] = {
      calendarAnchors: [
        {
          sourceCandidateId: candidate.id,
          date: candidate.date,
          label: candidate.label,
          category: candidate.category,
          scope: candidate.scope,
          reason: "Naturally supports family-care messaging.",
        },
      ],
      calendarReason: "D".repeat(281),
      cta: "C".repeat(201),
    };
    const dailyPackage = buildValidPackageRaw(
      context,
      dailyOverrides as Parameters<typeof buildValidPackageRaw>[1],
    );
    try {
      validateAndNormalizeSocialCalendarPackage({
        raw: dailyPackage,
        context,
        userGuidance: null,
        metadata: testMetadata(),
      });
      assert.fail("expected Daily package validation to fail");
    } catch (error) {
      assert.ok(error instanceof SocialCalendarPackageValidationError);
      assert.ok(
        error.failures.some((failure) =>
          failure.includes("calendarReason exceeds 280 characters."),
        ),
      );
      assert.ok(
        error.failures.some((failure) => failure.includes("cta exceeds 200 characters.")),
      );
    }

    try {
      validateAndNormalizeSocialCalendarPackage({
        raw: {
          ...buildValidPackageRaw(context),
          whyThisWeekWorks:
            "This week is a single explanation of education and one practical checklist without a second sentence.",
        },
        context,
        userGuidance: null,
        metadata: testMetadata(),
      });
      assert.fail("expected Daily whyThisWeekWorks validation to fail");
    } catch (error) {
      assert.ok(error instanceof SocialCalendarPackageValidationError);
      assert.ok(
        error.failures.some((failure) =>
          /whyThisWeekWorks must be 2-4 concise sentences/.test(failure),
        ),
      );
    }

    const dailyStrategy = buildValidStrategyRaw(context);
    dailyStrategy.weeklyObjective = "W".repeat(281);
    try {
      validateSocialPlannerWeeklyStrategy(dailyStrategy, context);
      assert.fail("expected Daily strategy validation to fail");
    } catch (error) {
      assert.ok(error instanceof SocialPlannerStrategyValidationError);
      assert.ok(
        error.failures.some((failure) =>
          failure.includes("weeklyObjective exceeds 280 characters."),
        ),
      );
    }

    const generator = read(
      "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
    );
    const evergreenValidator = read(
      "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
    );
    const dailyValidator = read(
      "services/socialPlanner/generation/validateSocialCalendarPackage.ts",
    );
    assert.doesNotMatch(generator, /normalizeEvergreenStrategyNarrativeFields/);
    assert.doesNotMatch(evergreenValidator, /calendarReasonMaxChars/);
    assert.doesNotMatch(evergreenValidator, /whyThisWeekWorksMinChars/);
    assert.doesNotMatch(evergreenValidator, /whyThisWeekWorksMaxSentences/);
    assert.match(dailyValidator, /calendarReasonMaxChars/);
    assert.match(dailyValidator, /whyThisWeekWorksMinChars/);
    assert.match(dailyValidator, /whyThisWeekWorksMinSentences/);
  });

  it("still fails closed when repair cannot fix a structural package", async () => {
    const context = buildGenerationContext();
    const invalid = evergreenPackageRaw(context);
    delete (invalid.days[0] as { title?: unknown }).title;
    let calls = 0;
    try {
      await generateEvergreenSocialCalendarPackage({
        context,
        generationMode: "standard",
        deps: {
          generateReview: async (prompt, options) => {
            calls += 1;
            const stage = String(options?.stage ?? "");
            return mockEvergreenGenerationResponse({
              prompt,
              stage,
              strategy: evergreenStrategyRaw(context),
              days: invalid.days,
            });
          },
        },
      });
      assert.fail("expected REPAIR_VALIDATION_FAILED");
    } catch (error) {
      assert.ok(error instanceof SocialPlannerGenerationError);
      assert.equal(error.code, "REPAIR_VALIDATION_FAILED");
      assert.equal(error.stage, "repair_validation");
      assert.ok(error.failures.includes("days[0].title is required."));
    }
    assert.equal(calls, 3);
  });
});
