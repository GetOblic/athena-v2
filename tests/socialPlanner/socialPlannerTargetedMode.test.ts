import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { SocialPlannerCreateForm } from "../../components/socialPlanner/SocialPlannerCreateForm";
import {
  buildSocialCalendarCreateBody,
  socialPlannerCreateBodyKeys,
} from "../../components/socialPlanner/socialPlannerClient";
import {
  formatSocialPlannerTargetSummary,
  normalizeSocialPlannerPersonaId,
  SOCIAL_PLANNER_TARGET_CLEAR_HREF,
} from "../../lib/socialPlanner/socialPlannerTargetPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { composeSocialCalendarContext } from "../../services/socialPlanner/calendar/composeSocialCalendarContext";
import {
  SOCIAL_PLANNER_ASSET_TYPES,
  SOCIAL_PLANNER_DIVERSITY_DEFAULTS,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerStrategyValidationError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  buildSocialPlannerAssetPrompt,
  buildSocialPlannerRepairPrompt,
  buildSocialPlannerStrategyPrompt,
} from "../../services/socialPlanner/generation/socialPlannerGenerationPrompts";
import {
  resolveDiversityPolicy,
  validateAndNormalizeSocialCalendarPackage,
  validateSocialPlannerWeeklyStrategy,
} from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import { composeSocialPlannerIntelligence } from "../../services/socialPlanner/intelligence/composeSocialPlannerIntelligence";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "../../services/superAdmin/strategicBlueprintInstructionConstants";
import { buildSocialPlannerDiversityRepairPrompt } from "../../services/socialPlanner/diversity/socialPlannerDiversityPrompt";
import {
  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerHistoricalDiversityResult,
  type SocialPlannerSocialMemoryV1,
} from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import { createSocialCalendarWithJob } from "../../services/socialPlanner/socialCalendarOrchestration";
import { buildFrozenSocialCalendarProvenance } from "../../services/socialPlanner/socialCalendarProvenance";
import { normalizeSocialCalendarCreateRequest } from "../../services/socialPlanner/socialCalendarRequest";
import {
  SOCIAL_CALENDAR_TABLE,
  createSocialCalendar,
} from "../../services/socialPlanner/socialCalendarService";
import { SOCIAL_CALENDAR_GENERATION_JOB_TABLE } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobService";
import { SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS } from "../../services/socialPlanner/socialCalendarTypes";
import {
  authorizedSocialPlannerTargetPersonaId,
  buildSocialPlannerTargetAudienceView,
  composeSocialPlannerPrimaryTargetAudience,
  mergeSocialCalendarTargetPersonaProvenance,
  readSocialPlannerTargetPersonaId,
  resolvePrimaryTargetFromLoadedPersonas,
  resolveSocialPlannerCompletionTargetPersonaId,
  resolveSocialPlannerTargetPersona,
  socialPlannerTargetPersonaProvenance,
} from "../../services/socialPlanner/socialPlannerTargetPersona";
import type { Persona } from "../../services/personas/personaService";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();
const TARGET_ID = "8657e42c-3b06-4e83-ad6c-3c9e938491d6";
const SECONDARY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "org-trusted";
const OTHER_ORG = "org-foreign";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function calendar() {
  return composeSocialCalendarContext({
    periodStart: TEST_PERIOD_START,
    periodEnd: TEST_PERIOD_END,
    geographyEvidence: {
      executiveGeographicReach: "United States",
    },
  });
}

function emptyDeps() {
  return {
    buildBrain: async () => null,
    loadDeepWebsiteIntelligence: async () => null,
    loadPersonas: async () => [],
    loadProspects: async () => [],
    loadSeoReports: async () => [],
    loadAdCampaigns: async () => [],
    loadBlueprints: async () => [],
    loadCurrentExecutiveVersions: async () => [],
    loadTrendSocialPrompt: async () => ({
      key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      configured: false,
      instructionText: "",
      revisionId: null,
      updatedAt: null,
      updatedBy: null,
    }),
  };
}

function fakePersona(
  organizationId: string,
  extras: Partial<Persona> = {},
): Persona {
  return {
    id: extras.id ?? TARGET_ID,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    organization_id: organizationId,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    persona_name: extras.persona_name ?? "Heritage Diner Owner",
    short_description:
      extras.short_description ?? "Traditional diner owner/operator",
    category: extras.category ?? "Hospitality",
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: extras.country ?? "United States",
    state: extras.state ?? "Ohio",
    city: extras.city ?? "Troy",
    location_summary: extras.location_summary ?? "Troy, Ohio",
    languages: null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: extras.occupation ?? "Diner owner/operator",
    seniority: extras.seniority ?? "Owner",
    industry_context: extras.industry_context ?? "Independent restaurants",
    lifestyle: null,
    interests: extras.interests ?? "Local regulars",
    digital_behavior: null,
    brands_influences: null,
    values_text: extras.values_text ?? "Keep the counter full",
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: extras.goals ?? "Fill weekday lunch",
    needs: extras.needs ?? "Reliable weekday traffic",
    pain_points: extras.pain_points ?? "Empty midweek tables",
    fears: extras.fears ?? "Losing regulars",
    motivations: extras.motivations ?? "Family business pride",
    objections: extras.objections ?? "Marketing feels wasteful",
    buying_triggers: extras.buying_triggers ?? "Neighbor referral",
    decision_criteria: extras.decision_criteria ?? "Simple and local",
    purchase_behavior: null,
    typical_concerns: null,
    communication_style: extras.communication_style ?? "Plain and warm",
    preferred_channels: extras.preferred_channels ?? "Facebook",
    reference_website: null,
    notes: "private admin note",
    additional_context: null,
    ads_content: extras.ads_content ?? null,
    source: "manual",
    status: extras.status ?? "Ready",
    lifecycle_status: extras.lifecycle_status ?? "In Use",
    opportunity_score: null,
    priority: 0,
    profile_json: extras.profile_json ?? { secret: "profile-secret" },
    raw_json: extras.raw_json ?? { secret: "persona-secret" },
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: extras.import_batch_id ?? "import-batch-9",
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    ...extras,
    organization_id: organizationId,
  };
}

function installSocialCalendarCreateMock() {
  const calendarInserts: Record<string, unknown>[] = [];
  const jobInserts: Record<string, unknown>[] = [];
  const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const builder = {
      insert(row: Record<string, unknown>) {
        if (table === SOCIAL_CALENDAR_TABLE) {
          calendarInserts.push(row);
        } else if (table === SOCIAL_CALENDAR_GENERATION_JOB_TABLE) {
          jobInserts.push(row);
        }
        return builder;
      },
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      in() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (table === SOCIAL_CALENDAR_TABLE) {
          const row = calendarInserts[calendarInserts.length - 1] ?? {};
          return {
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              ...row,
            },
            error: null,
          };
        }
        if (table === SOCIAL_CALENDAR_GENERATION_JOB_TABLE) {
          const row = jobInserts[jobInserts.length - 1] ?? {};
          return {
            data: {
              id: "22222222-2222-4222-8222-222222222222",
              status: "queued",
              generation_stage: "queued",
              attempt_count: 0,
              max_attempts: 3,
              claimed_by: null,
              claim_token: null,
              claimed_at: null,
              claim_expires_at: null,
              heartbeat_at: null,
              next_attempt_at: null,
              error_code: null,
              error_message: null,
              error_metadata: null,
              started_at: null,
              completed_at: null,
              ...row,
            },
            error: null,
          };
        }
        return { data: null, error: { message: `unexpected table ${table}` } };
      },
    };
    return builder;
  };

  return {
    calendarInserts,
    jobInserts,
    restore() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any).from = originalFrom;
    },
  };
}

async function runTargetedCreatePath(input: {
  body: Record<string, unknown>;
  organizationId: string;
  loadPersonaById?: (
    personaId: string,
    organizationId: string,
  ) => Promise<Persona | null>;
}) {
  const createRequest = normalizeSocialCalendarCreateRequest(input.body);
  const targetPersona = createRequest.personaId
    ? await resolveSocialPlannerTargetPersona({
        personaId: createRequest.personaId,
        organizationId: input.organizationId,
        loadPersonaById: input.loadPersonaById,
      })
    : null;
  const created = await createSocialCalendarWithJob({
    organizationId: input.organizationId,
    userId: "user-1",
    periodStart: createRequest.periodStart,
    periodEnd: createRequest.periodEnd,
    userGuidance: createRequest.userGuidance,
    targetPersonaId: targetPersona?.id ?? null,
  });
  return {
    createRequest,
    targetPersonaId: targetPersona?.id ?? null,
    created,
  };
}

describe("Social Planner targeted mode — Persona CTA", () => {
  it("points plan-social at the current Persona id only", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /data-persona-header-action="plan-social"/);
    assert.match(
      page,
      /href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/,
    );
    assert.doesNotMatch(page, /href="\/social-planner"/);
    assert.doesNotMatch(
      page,
      /social-planner\?personaId=\$\{persona\.(persona_name|short_description|raw_json|profile_json)/,
    );
    assert.match(page, /audienceToolsActions/);
    assert.match(page, /audienceToolsGroupLabel=\{journeyChrome\.audienceToolsGroup\}/);
    assert.match(page, /data-persona-header-action="create-advertising"/);
    assert.match(
      page,
      /href=\{`\/ads\/new\?personaId=\$\{persona\.id\}`\}/,
    );
  });
});

describe("Social Planner targeted mode — generic planner", () => {
  it("keeps generic create UI and request shape when personaId is absent", () => {
    const html = renderToStaticMarkup(
      createElement(SocialPlannerCreateForm, {
        submitting: false,
        error: null,
        onSubmit() {},
        messages: en,
      }),
    );
    assert.doesNotMatch(html, /data-social-planner-target/);
    assert.doesNotMatch(html, /Target audience/);
    assert.match(html, /Optional direction/);
    assert.match(html, /id="social-planner-guidance"/);
    assert.match(html, /Leave blank and Athena will decide/);
    assert.doesNotMatch(html, /persona picker|audience picker/i);

    const body = buildSocialCalendarCreateBody({
      periodStart: TEST_PERIOD_START,
      periodEnd: TEST_PERIOD_END,
      userGuidance: "",
    });
    assert.deepEqual(socialPlannerCreateBodyKeys(body), [
      "periodEnd",
      "periodStart",
      "userGuidance",
    ]);
    assert.equal("personaId" in body, false);
    assert.equal("organizationId" in body, false);

    const normalized = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      userGuidance: "   ",
    });
    assert.equal(normalized.personaId, null);
    assert.equal(normalized.userGuidance, null);
    assert.equal(normalized.generationMode, "standard");
  });

  it("keeps the distribute-personas strategy rule in generic prompts", () => {
    const genericContext = buildGenerationContext();
    const generic = buildSocialPlannerStrategyPrompt({
      context: genericContext,
      userGuidance: null,
    });
    const genericAsset = buildSocialPlannerAssetPrompt({
      context: genericContext,
      userGuidance: null,
      strategy: buildValidStrategyRaw(genericContext) as never,
    });
    assert.match(
      generic,
      /If multiple Personas exist, distribute them\. Do not force every Persona into the week\. Do not invent IDs\./,
    );
    assert.match(
      generic,
      /Decide objective, audience rotation, topic mix, format mix/,
    );
    assert.match(
      genericAsset,
      /Vary formats, objectives, hooks, and audiences\./,
    );
    assert.match(
      genericAsset,
      /Keep whyThisWeekWorks to 2-4 concise sentences\. Explain the mix\./,
    );
    assert.doesNotMatch(generic, /PRIMARY TARGET AUDIENCE \(TRUSTED\)/);
    assert.doesNotMatch(genericAsset, /PRIMARY TARGET AUDIENCE \(TRUSTED\)/);
    assert.doesNotMatch(generic, /keeping the selected primary Audience as the target/);
    assert.doesNotMatch(genericAsset, /keeping the selected primary Audience as the target/);
    assert.match(generic, /=== USER GUIDANCE ===/);
    assert.doesNotMatch(generic, /Do not rotate to another Persona/);
    assert.equal(genericContext.primaryTargetAudience, undefined);
    assert.equal(genericContext.authorizedTargetPersonaId, undefined);
  });
});

describe("Social Planner targeted mode — page and composer", () => {
  it("resolves same-org personaId and renders the compact target chip", () => {
    const page = read("app/social-planner/page.tsx");
    assert.match(page, /searchParams\?: Promise<\{ id\?: string; personaId\?: string \}>/);
    assert.match(page, /redirect\(`\/social-planner\/\$\{requestedId\}`\)/);
    assert.match(page, /SOCIAL_PLANNER_CALENDAR_ID_RE\.test\(params\.id\)/);
    assert.match(
      page,
      /resolveSocialPlannerTargetAudienceView\(\s*typeof params\.personaId === "string" \? params\.personaId : null,\s*organizationId,/,
    );
    assert.match(page, /targetAudience=\{targetAudience\}/);
    assert.doesNotMatch(page, /searchParams\.get\("organizationId"\)/);
    assert.doesNotMatch(page, /getPersonaById\([^,]+\)/);

    const persona = fakePersona(ORG);
    const view = buildSocialPlannerTargetAudienceView(persona);
    assert.equal(view.personaId, TARGET_ID);
    assert.equal(view.name, "Heritage Diner Owner");
    assert.equal(
      view.summary,
      "Troy, Ohio · Traditional diner owner/operator",
    );

    const html = renderToStaticMarkup(
      createElement(SocialPlannerCreateForm, {
        submitting: false,
        error: null,
        targetAudience: view,
        onSubmit() {},
        messages: en,
      }),
    );
    assert.match(html, /data-social-planner-target="audience"/);
    assert.match(html, /Target audience/);
    assert.match(html, /Heritage Diner Owner/);
    assert.match(html, /Troy, Ohio · Traditional diner owner\/operator/);
    assert.match(html, /Optional direction/);
    assert.match(html, /href="\/social-planner"/);
    assert.match(html, /data-social-planner-clear-target/);
    assert.match(html, />Clear</);
    assert.doesNotMatch(html, /persona picker|audience picker/i);
    assert.match(html, /Leave blank and Athena will decide/);

    const body = buildSocialCalendarCreateBody({
      periodStart: TEST_PERIOD_START,
      periodEnd: TEST_PERIOD_END,
      userGuidance: "",
      personaId: view.personaId,
    });
    assert.equal(body.personaId, TARGET_ID);
    assert.equal(body.personaId, view.personaId);
    assert.notEqual(body.personaId, view.name);
  });

  it("Clear restores generic \/social-planner and does not mutate", () => {
    assert.equal(SOCIAL_PLANNER_TARGET_CLEAR_HREF, "/social-planner");
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.match(form, /href=\{SOCIAL_PLANNER_TARGET_CLEAR_HREF\}/);
    assert.doesNotMatch(form, /fetch\(|router\.delete|DELETE/);
    assert.match(form, /useState\(""\)/);
  });
});

describe("Social Planner targeted mode — fail closed", () => {
  it("invalid, missing, and wrong-org Persona IDs leak nothing", async () => {
    assert.equal(normalizeSocialPlannerPersonaId("not-a-uuid"), null);
    assert.equal(normalizeSocialPlannerPersonaId(TARGET_ID), TARGET_ID);
    assert.equal(
      formatSocialPlannerTargetSummary("Troy, Ohio", "Traditional diner owner/operator"),
      "Troy, Ohio · Traditional diner owner/operator",
    );

    const invalid = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      personaId: "not-a-uuid",
    });
    assert.equal(invalid.personaId, null);

    const missing = await resolveSocialPlannerTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () => null,
    });
    assert.equal(missing, null);

    const wrongOrg = await resolveSocialPlannerTargetPersona({
      personaId: TARGET_ID,
      organizationId: ORG,
      loadPersonaById: async () => fakePersona(OTHER_ORG),
    });
    assert.equal(wrongOrg, null);

    const ignoredBlob = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      personaId: TARGET_ID,
      persona: { persona_name: "Should not persist" },
      organizationId: "browser-org",
    });
    assert.equal(ignoredBlob.personaId, TARGET_ID);
    assert.equal("persona" in ignoredBlob, false);
    assert.equal("organizationId" in ignoredBlob, false);

    assert.equal(
      resolvePrimaryTargetFromLoadedPersonas({
        targetPersonaId: TARGET_ID,
        organizationId: ORG,
        personas: [fakePersona(OTHER_ORG)],
      }),
      null,
    );
  });
});

describe("Social Planner targeted mode — create API and provenance", () => {
  it("accepts optional personaId and still rejects browser organizationId", () => {
    const route = read("app/api/social-planner/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /normalizeSocialCalendarCreateRequest/);
    assert.match(route, /resolveSocialPlannerTargetPersona/);
    assert.match(route, /getPersonaById|loadPersonaById|organizationId/);
    assert.match(route, /targetPersonaId: targetPersona\?\.id \?\? null/);
    assert.doesNotMatch(route, /body\.organizationId/);

    const targeted = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      periodEnd: TEST_PERIOD_END,
      userGuidance: "Keep it local",
      personaId: TARGET_ID,
      organizationId: "browser-org",
    });
    assert.equal(targeted.personaId, TARGET_ID);
    assert.equal(targeted.userGuidance, "Keep it local");
    assert.equal("organizationId" in targeted, false);

    const body = buildSocialCalendarCreateBody({
      periodStart: TEST_PERIOD_START,
      periodEnd: TEST_PERIOD_END,
      userGuidance: "",
      personaId: TARGET_ID,
    });
    assert.deepEqual(socialPlannerCreateBodyKeys(body), [
      "periodEnd",
      "periodStart",
      "personaId",
      "userGuidance",
    ]);
    assert.equal(body.personaId, TARGET_ID);
  });

  it("persists targetPersonaId only for resolved targets", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(
      service,
      /provenance_json: socialPlannerTargetPersonaProvenance\(input\.targetPersonaId\)/,
    );
    assert.deepEqual(socialPlannerTargetPersonaProvenance(TARGET_ID), {
      targetPersonaId: TARGET_ID,
    });
    assert.deepEqual(socialPlannerTargetPersonaProvenance(null), {});
    assert.deepEqual(socialPlannerTargetPersonaProvenance("bad"), {});
    assert.equal(
      readSocialPlannerTargetPersonaId({ targetPersonaId: TARGET_ID }),
      TARGET_ID,
    );
    assert.equal(readSocialPlannerTargetPersonaId({}), null);
    assert.deepEqual(
      mergeSocialCalendarTargetPersonaProvenance(
        { generationMode: "standard" },
        { targetPersonaId: TARGET_ID },
      ),
      { generationMode: "standard", targetPersonaId: TARGET_ID },
    );
    assert.deepEqual(
      mergeSocialCalendarTargetPersonaProvenance(
        { generationMode: "standard" },
        {},
      ),
      { generationMode: "standard" },
    );
  });

  it("create path persists the resolved target on INSERT and omits it from the job row", async () => {
    const mock = installSocialCalendarCreateMock();
    try {
      const result = await runTargetedCreatePath({
        body: {
          periodStart: TEST_PERIOD_START,
          periodEnd: TEST_PERIOD_END,
          userGuidance: "",
          personaId: TARGET_ID,
        },
        organizationId: ORG,
        loadPersonaById: async () => fakePersona(ORG),
      });

      assert.equal(result.createRequest.personaId, TARGET_ID);
      assert.equal(result.targetPersonaId, TARGET_ID);
      assert.equal(mock.calendarInserts.length, 1);
      const inserted = mock.calendarInserts[0];
      assert.equal(inserted.targetPersonaId, undefined);
      assert.deepEqual(inserted.provenance_json, { targetPersonaId: TARGET_ID });
      assert.equal(
        readSocialPlannerTargetPersonaId(inserted.provenance_json),
        TARGET_ID,
      );
      assert.equal(mock.jobInserts.length, 1);
      assert.equal("targetPersonaId" in mock.jobInserts[0], false);
      assert.equal("personaId" in mock.jobInserts[0], false);
    } finally {
      mock.restore();
    }
  });

  it("generic create stays valid and inserts empty provenance", async () => {
    const mock = installSocialCalendarCreateMock();
    try {
      const result = await runTargetedCreatePath({
        body: {
          periodStart: TEST_PERIOD_START,
          userGuidance: "",
        },
        organizationId: ORG,
        loadPersonaById: async () => fakePersona(ORG),
      });

      assert.equal(result.createRequest.personaId, null);
      assert.equal(result.targetPersonaId, null);
      assert.equal(mock.calendarInserts.length, 1);
      assert.deepEqual(mock.calendarInserts[0].provenance_json, {});
      assert.equal(
        readSocialPlannerTargetPersonaId(mock.calendarInserts[0].provenance_json),
        null,
      );
      assert.equal("targetPersonaId" in mock.calendarInserts[0], false);
    } finally {
      mock.restore();
    }
  });

  it("invalid, missing, and wrong-org targets fail closed to empty provenance", async () => {
    const mock = installSocialCalendarCreateMock();
    try {
      const invalid = await runTargetedCreatePath({
        body: {
          periodStart: TEST_PERIOD_START,
          personaId: "not-a-uuid",
        },
        organizationId: ORG,
        loadPersonaById: async () => fakePersona(ORG),
      });
      assert.equal(invalid.createRequest.personaId, null);
      assert.equal(invalid.targetPersonaId, null);
      assert.deepEqual(mock.calendarInserts[0].provenance_json, {});

      const missing = await runTargetedCreatePath({
        body: {
          periodStart: TEST_PERIOD_START,
          personaId: TARGET_ID,
        },
        organizationId: ORG,
        loadPersonaById: async () => null,
      });
      assert.equal(missing.targetPersonaId, null);
      assert.deepEqual(mock.calendarInserts[1].provenance_json, {});

      const wrongOrg = await runTargetedCreatePath({
        body: {
          periodStart: TEST_PERIOD_START,
          personaId: TARGET_ID,
          organizationId: "browser-forced-org",
        },
        organizationId: ORG,
        loadPersonaById: async () => fakePersona(OTHER_ORG),
      });
      assert.equal(wrongOrg.targetPersonaId, null);
      assert.deepEqual(mock.calendarInserts[2].provenance_json, {});

      const direct = await createSocialCalendar({
        organizationId: ORG,
        userId: "user-1",
        periodStart: TEST_PERIOD_START,
        periodEnd: TEST_PERIOD_END,
        userGuidance: null,
        targetPersonaId: TARGET_ID,
      });
      assert.equal(
        readSocialPlannerTargetPersonaId(direct.provenance_json),
        TARGET_ID,
      );
      assert.deepEqual(mock.calendarInserts[3].provenance_json, {
        targetPersonaId: TARGET_ID,
      });
    } finally {
      mock.restore();
    }
  });
});

describe("Social Planner targeted mode — intelligence and prompt", () => {
  it("builds a bounded primary target and keeps the rest of the portfolio secondary", async () => {
    const target = fakePersona(ORG, {
      purchase_behavior:
        "Cautious and deliberate; prefers proven, easy-to-understand solutions with no significant operational overhaul.",
    });
    const secondary = fakePersona(ORG, {
      id: SECONDARY_ID,
      persona_name: "Maria Rodriguez",
      short_description: "Salon owner catching missed calls",
      city: "Columbus",
      state: "Ohio",
      location_summary: "Urban salon owners",
      pain_points: "Missed calls after hours",
      goals: "Recover every booking",
    });
    const context = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      targetPersonaId: TARGET_ID,
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => [secondary, target],
      },
    });

    assert.ok(context.primaryTargetAudience);
    assert.equal(context.authorizedTargetPersonaId, TARGET_ID);
    assert.equal(
      authorizedSocialPlannerTargetPersonaId(context),
      TARGET_ID,
    );
    assert.equal(context.primaryTargetAudience?.name, "Heritage Diner Owner");
    assert.equal(context.primaryTargetAudience?.city, "Troy");
    assert.equal(context.primaryTargetAudience?.state, "Ohio");
    assert.equal(context.primaryTargetAudience?.goals, "Fill weekday lunch");
    assert.equal(context.primaryTargetAudience?.painPoints, "Empty midweek tables");
    assert.equal(context.primaryTargetAudience?.motivations, "Family business pride");
    assert.equal(context.primaryTargetAudience?.objections, "Marketing feels wasteful");
    assert.equal(context.primaryTargetAudience?.preferredChannels, "Facebook");
    assert.equal(context.primaryTargetAudience?.buyingTriggers, "Neighbor referral");
    assert.equal(context.primaryTargetAudience?.decisionCriteria, "Simple and local");
    assert.equal(
      context.primaryTargetAudience?.purchaseBehavior,
      "Cautious and deliberate; prefers proven, easy-to-understand solutions with no significant operational overhaul.",
    );
    assert.equal("id" in (context.primaryTargetAudience ?? {}), false);
    assert.equal("raw_json" in (context.primaryTargetAudience ?? {}), false);
    assert.equal("profile_json" in (context.primaryTargetAudience ?? {}), false);
    assert.doesNotMatch(JSON.stringify(context.primaryTargetAudience), /persona-secret|profile-secret|import-batch-9/);
    assert.doesNotMatch(
      JSON.stringify(context.primaryTargetAudience),
      /Missed calls after hours|Maria Rodriguez|Recover every booking/,
    );
    assert.doesNotMatch(context.composedText, /authorizedTargetPersonaId/);
    assert.ok(context.personas.personas.some((row) => row.id === TARGET_ID));
    assert.ok(context.personas.personas.some((row) => row.id === SECONDARY_ID));
    assert.match(context.composedText, /PRIMARY TARGET AUDIENCE/);
    assert.match(context.composedText, /PERSONA PORTFOLIO/);
    assert.notEqual(context.primaryTargetAudience?.name, "Maria Rodriguez");

    const summary = composeSocialPlannerPrimaryTargetAudience(target);
    assert.equal(summary.name, "Heritage Diner Owner");
    assert.equal(summary.purchaseBehavior, target.purchase_behavior);
    assert.doesNotMatch(JSON.stringify(summary), /raw_json|profile_json|import_batch/);

    const sparse = composeSocialPlannerPrimaryTargetAudience(
      fakePersona(ORG, {
        goals: null,
        pain_points: null,
        purchase_behavior: null,
        motivations: null,
      }),
    );
    assert.equal(sparse.goals, null);
    assert.equal(sparse.painPoints, null);
    assert.equal(sparse.purchaseBehavior, null);
    assert.equal(sparse.motivations, null);
  });

  it("fails closed on missing or foreign targets and leaves generic context unchanged", async () => {
    const generic = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => [
          fakePersona(ORG, {
            id: SECONDARY_ID,
            persona_name: "Coastal Retiree",
          }),
        ],
        loadPersonaById: async () => null,
      },
    });
    const invalid = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      targetPersonaId: "not-a-uuid",
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => [
          fakePersona(ORG, {
            id: SECONDARY_ID,
            persona_name: "Coastal Retiree",
          }),
        ],
        loadPersonaById: async () => fakePersona(ORG),
      },
    });
    const missing = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      targetPersonaId: TARGET_ID,
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => [
          fakePersona(ORG, {
            id: SECONDARY_ID,
            persona_name: "Coastal Retiree",
          }),
        ],
        loadPersonaById: async () => null,
      },
    });

    assert.equal(generic.primaryTargetAudience, undefined);
    assert.equal(generic.authorizedTargetPersonaId, undefined);
    assert.equal(invalid.primaryTargetAudience, undefined);
    assert.equal(invalid.authorizedTargetPersonaId, undefined);
    assert.equal(missing.primaryTargetAudience, undefined);
    assert.equal(missing.authorizedTargetPersonaId, undefined);
    assert.doesNotMatch(generic.composedText, /PRIMARY TARGET AUDIENCE/);
    assert.doesNotMatch(invalid.composedText, /PRIMARY TARGET AUDIENCE/);
    assert.doesNotMatch(missing.composedText, /PRIMARY TARGET AUDIENCE/);
    assert.equal(
      generic.personas.personas.some((row) => row.id === TARGET_ID),
      false,
    );
  });

  it("activates primaryTargetAudience from persisted provenance, not portfolio presence", async () => {
    const target = fakePersona(ORG);
    const secondary = fakePersona(ORG, {
      id: SECONDARY_ID,
      persona_name: "Maria Rodriguez",
      short_description: "Salon owner catching missed calls",
    });
    const persisted = socialPlannerTargetPersonaProvenance(TARGET_ID);
    const recovered = readSocialPlannerTargetPersonaId(persisted);
    assert.equal(recovered, TARGET_ID);

    const context = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      targetPersonaId: recovered,
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => [secondary, target],
      },
    });

    assert.ok(context.primaryTargetAudience);
    assert.equal(context.authorizedTargetPersonaId, TARGET_ID);
    assert.equal(context.primaryTargetAudience?.name, "Heritage Diner Owner");
    assert.notEqual(context.primaryTargetAudience?.name, "Maria Rodriguez");
    assert.ok(context.personas.personas.some((row) => row.id === SECONDARY_ID));
    assert.match(context.composedText, /PRIMARY TARGET AUDIENCE/);

    const genericPortfolio = await composeSocialPlannerIntelligence({
      organizationId: ORG,
      calendarContext: calendar(),
      targetPersonaId: readSocialPlannerTargetPersonaId({}),
      deps: {
        ...emptyDeps(),
        loadPersonas: async () => [secondary, target],
      },
    });
    assert.equal(genericPortfolio.primaryTargetAudience, undefined);
    assert.equal(genericPortfolio.authorizedTargetPersonaId, undefined);
    assert.ok(genericPortfolio.personas.personas.some((row) => row.id === TARGET_ID));
    assert.doesNotMatch(genericPortfolio.composedText, /PRIMARY TARGET AUDIENCE/);
  });

  it("adds the trusted primary-target block only when resolved and keeps guidance untrusted", () => {
    const genericContext = buildGenerationContext();
    const targetedContext = {
      ...genericContext,
      primaryTargetAudience: composeSocialPlannerPrimaryTargetAudience(
        fakePersona(ORG, {
          purchase_behavior:
            "Cautious and deliberate; prefers proven solutions and testimonials from similar traditional businesses.",
        }),
      ),
      authorizedTargetPersonaId: TARGET_ID,
    };
    const genericPrompt = buildSocialPlannerStrategyPrompt({
      context: genericContext,
      userGuidance: "Theme the week around a patio offer",
    });
    const targetedPrompt = buildSocialPlannerStrategyPrompt({
      context: targetedContext,
      userGuidance: "Theme the week around a patio offer",
    });
    const assetPrompt = buildSocialPlannerAssetPrompt({
      context: targetedContext,
      userGuidance: "Theme the week around a patio offer",
      strategy: buildValidStrategyRaw(genericContext) as never,
    });

    assert.doesNotMatch(genericPrompt, /PRIMARY TARGET AUDIENCE \(TRUSTED\)/);
    assert.match(
      genericPrompt,
      /If multiple Personas exist, distribute them\. Do not force every Persona into the week\. Do not invent IDs\./,
    );
    assert.match(targetedPrompt, /=== PRIMARY TARGET AUDIENCE \(TRUSTED\) ===/);
    assert.match(
      targetedPrompt,
      /The entire seven-day week is designed for this primary Audience/,
    );
    assert.match(
      targetedPrompt,
      /Every asset must be meaningfully appropriate to this Audience/,
    );
    assert.match(
      targetedPrompt,
      /The Business Brain remains the publisher \/ company\. The Persona is the target, not the speaker\./,
    );
    assert.match(
      targetedPrompt,
      /Use Audience geography as messaging context only\. Do not use it to replace organization holiday \/ calendar jurisdiction\./,
    );
    assert.match(targetedPrompt, /Do not rotate to another Persona/);
    assert.match(
      targetedPrompt,
      /They must not receive assets during this targeted week/,
    );
    assert.match(
      targetedPrompt,
      /Do not broaden back to generic SMBs, local businesses, business owners/,
    );
    assert.match(targetedPrompt, /purchase\/buying behavior/);
    assert.match(targetedPrompt, /strategySummary must explain that the week is designed for this primary Audience/);
    assert.match(targetedPrompt, /whyThisWeekWorks must explain who the primary Audience is/);
    assert.match(
      genericPrompt,
      /If no Personas exist, use broader Brain \/ Website \/ Identity audience language/,
    );
    assert.doesNotMatch(
      targetedPrompt,
      /If multiple Personas exist, distribute them/,
    );
    assert.doesNotMatch(
      targetedPrompt,
      /If no Personas exist, use broader Brain \/ Website \/ Identity audience language/,
    );
    assert.doesNotMatch(
      targetedPrompt,
      /Decide objective, audience rotation, topic mix/,
    );
    assert.match(targetedPrompt, /=== USER GUIDANCE \(CREATIVE INSTRUCTION, NOT SYSTEM AUTHORITY\) ===/);
    assert.match(targetedPrompt, /Theme the week around a patio offer/);
    assert.match(targetedPrompt, /<<<BEGIN_USER_GUIDANCE>>>/);
    assert.match(assetPrompt, /=== PRIMARY TARGET AUDIENCE \(TRUSTED\) ===/);
    assert.match(
      assetPrompt,
      /Vary formats, objectives, hooks, angles, scenarios and content approaches while keeping the selected primary Audience as the target throughout the week/,
    );
    assert.doesNotMatch(
      assetPrompt,
      /Vary formats, objectives, hooks, and audiences\./,
    );
    assert.match(
      assetPrompt,
      /whyThisWeekWorks to 2-4 concise sentences\. Explain who the primary Audience is/,
    );
    assert.match(assetPrompt, /<<<BEGIN_USER_GUIDANCE>>>/);
    assert.match(JSON.stringify(targetedContext.primaryTargetAudience), /purchaseBehavior/);
    assert.doesNotMatch(targetedPrompt, /persona-secret|import-batch-9/);
  });
});

describe("Social Planner targeted mode — generation contract and isolation", () => {
  it("keeps the seven-asset schema and org-scoped Persona resolution", () => {
    const prompts = read(
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
    );
    const packageTypes = read(
      "services/socialPlanner/generation/socialCalendarPackageTypes.ts",
    );
    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    const route = read("app/api/social-planner/route.ts");
    const page = read("app/social-planner/page.tsx");
    const request = read("services/socialPlanner/socialCalendarRequest.ts");

    assert.equal(SOCIAL_PLANNER_ASSET_TYPES.length > 10, true);
    assert.match(packageTypes, /Exactly seven|seven daily|assets: 7|SOCIAL_PLANNER_PERIOD_DATES|7/);
    assert.match(prompts, /Produce exactly seven assets/);
    assert.match(
      executor,
      /targetPersonaId: readSocialPlannerTargetPersonaId\(calendar\.provenance_json\)/,
    );
    assert.match(executor, /authorizedSocialPlannerTargetPersonaId\(context\)/);
    assert.match(executor, /persistedTargetId \?\? authorizedTargetId \?\? null/);
    assert.match(
      read("services/socialPlanner/socialCalendarProvenance.ts"),
      /targetPersonaId\?: string \| null/,
    );
    assert.match(executor, /mergeSocialCalendarTargetPersonaProvenance/);
    assert.match(executor, /organizationId: job\.organization_id/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(page, /requireCurrentOrganizationContext/);
    assert.match(page, /resolveSocialPlannerTargetAudienceView/);
    assert.match(request, /organizationId: _organizationIdCamel/);
    assert.doesNotMatch(route, /body\.organizationId|searchParams\.get\("organizationId"\)/);
    assert.doesNotMatch(page, /getPersonaById\(\s*params/);
    assert.doesNotMatch(
      read("services/socialPlanner/socialPlannerTargetPersona.ts"),
      /getPersonaById\(\s*personaId\s*\)/,
    );
    assert.match(
      read("services/socialPlanner/socialPlannerTargetPersona.ts"),
      /getPersonaById\(personaId, organizationId\)/,
    );
  });
});

const TARGETED_AUDIENCE_WORDING = [
  "established family restaurant owners",
  "traditional restaurant owner/operators evaluating practical improvements",
  "community-rooted hospitality businesses cautious about disruption",
  "family-owned diner operators who want proven methods",
  "traditional restaurant owners comparing low-commitment tools",
  "established hospitality operators seeking clear demonstrations of value",
  "owner-operators of traditional neighborhood restaurants",
];

function targetedGenerationContext() {
  const context = buildGenerationContext({
    personas: [
      {
        id: TARGET_ID,
        name: "Heritage Diner Owner",
        category: "Hospitality",
        occupation: "Diner owner/operator",
        seniority: "Owner",
        audienceSegment: "Traditional restaurant owners",
        needs: "Reliable weekday traffic",
        painPoints: "Empty midweek tables",
        motivations: "Family business pride",
        objections: "Marketing feels wasteful",
        contentInterests: "Local regulars",
        decisionDrivers: "Simple and local",
        communicationPreferences: "Plain and warm",
        audienceGeography: "Troy, Ohio",
        status: "Ready",
        lifecycleStatus: "In Use",
      },
      {
        id: SECONDARY_ID,
        name: "Maria Rodriguez",
        category: "Services",
        occupation: "Salon owner",
        seniority: "Owner",
        audienceSegment: "Independent salon owners",
        needs: "Catch every booking",
        painPoints: "Missed calls after hours",
        motivations: "Grow the chair",
        objections: "Another tool to learn",
        contentInterests: "Client retention",
        decisionDrivers: "Immediate booking recovery",
        communicationPreferences: "Direct",
        audienceGeography: "Urban",
        status: "Ready",
        lifecycleStatus: "In Use",
      },
    ],
  });
  return {
    ...context,
    primaryTargetAudience: composeSocialPlannerPrimaryTargetAudience(
      fakePersona(ORG, {
        purchase_behavior:
          "Cautious and deliberate; prefers proven solutions and testimonials from similar traditional businesses.",
      }),
    ),
    authorizedTargetPersonaId: TARGET_ID,
  };
}

function targetedSingleAudiencePackage(
  context: ReturnType<typeof targetedGenerationContext>,
) {
  return buildValidPackageRaw(
    context,
    context.calendarContext.period.dates.map((_, index) => ({
      audience: TARGETED_AUDIENCE_WORDING[index],
      personaIds: [TARGET_ID],
      sourceSignals: [
        { type: "organization", id: TEST_ORG },
        { type: "persona", id: TARGET_ID },
      ],
    })),
  );
}

function frozenGenerationProvenance() {
  return {
    ...testMetadata(),
    socialMemorySchemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
    diversityAlgorithmVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    historicalDiversityCheckVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
    historicalCalendarsConsidered: 1,
    historicalAssetsConsidered: 7,
    highestHistoricalSimilarity: 0.1,
    weekHistoricalSimilarity: 0.1,
    historicalDiversityRepairUsed: false,
    diversityRepairPromptVersion: null,
  };
}

function emptySocialMemory(): SocialPlannerSocialMemoryV1 {
  return {
    schemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
    organizationId: TEST_ORG,
    calendarsConsidered: 0,
    calendarsIncluded: 0,
    historicalAssets: [],
    historicalWeeks: [],
    recencyWindow: {
      maxCalendars: 10,
      maxAssets: 70,
      composedTextMaxChars: 8000,
    },
    diagnostics: {
      calendarsConsidered: 0,
      calendarsIncluded: 0,
      assetsIncluded: 0,
      earliestHistoricalCreatedAt: null,
      latestHistoricalCreatedAt: null,
      malformedPackagesSkipped: 0,
      invalidFingerprintRowsSkipped: 0,
      memoryCharacterCount: 0,
      truncated: false,
    },
    composedText: "",
  };
}

function failingDiversity(): SocialPlannerHistoricalDiversityResult {
  return {
    accepted: false,
    overallScore: 0.9,
    highestAssetSimilarity: 0.9,
    weekSimilarity: 0.4,
    violations: [
      {
        kind: "hard_duplicate",
        code: "dup",
        message: "Repeated a recent creative combination.",
      },
    ],
    warnings: [],
    comparisons: [],
  };
}

describe("Social Planner targeted mode — frozen provenance", () => {
  it("preserves targetPersonaId through freeze and does not invent one generically", () => {
    const genericContext = buildGenerationContext();
    const targetedContext = targetedGenerationContext();
    const createProvenance = socialPlannerTargetPersonaProvenance(TARGET_ID);

    const frozenTargeted = buildFrozenSocialCalendarProvenance({
      context: targetedContext,
      calendarContext: targetedContext.calendarContext,
      generationProvenance: frozenGenerationProvenance(),
      targetPersonaId: readSocialPlannerTargetPersonaId(createProvenance),
    });
    assert.equal(frozenTargeted.targetPersonaId, TARGET_ID);
    assert.equal(readSocialPlannerTargetPersonaId(frozenTargeted), TARGET_ID);

    const completed = mergeSocialCalendarTargetPersonaProvenance(
      frozenTargeted,
      createProvenance,
    );
    assert.equal(readSocialPlannerTargetPersonaId(completed), TARGET_ID);
    assert.equal(completed.targetPersonaId, TARGET_ID);

    const frozenGeneric = buildFrozenSocialCalendarProvenance({
      context: genericContext,
      calendarContext: genericContext.calendarContext,
      generationProvenance: frozenGenerationProvenance(),
    });
    assert.equal("targetPersonaId" in frozenGeneric, false);
    assert.equal(readSocialPlannerTargetPersonaId(frozenGeneric), null);

    const frozenNull = buildFrozenSocialCalendarProvenance({
      context: genericContext,
      calendarContext: genericContext.calendarContext,
      generationProvenance: frozenGenerationProvenance(),
      targetPersonaId: null,
    });
    const frozenInvalid = buildFrozenSocialCalendarProvenance({
      context: genericContext,
      calendarContext: genericContext.calendarContext,
      generationProvenance: frozenGenerationProvenance(),
      targetPersonaId: "not-a-uuid",
    });
    assert.equal("targetPersonaId" in frozenNull, false);
    assert.equal("targetPersonaId" in frozenInvalid, false);
    assert.deepEqual(
      mergeSocialCalendarTargetPersonaProvenance(frozenGeneric, {}),
      frozenGeneric,
    );

    assert.equal(
      resolveSocialPlannerCompletionTargetPersonaId(createProvenance, targetedContext),
      TARGET_ID,
    );
    assert.equal(
      resolveSocialPlannerCompletionTargetPersonaId({}, targetedContext),
      TARGET_ID,
    );
    assert.equal(
      resolveSocialPlannerCompletionTargetPersonaId({}, genericContext),
      null,
    );
  });
});

describe("Social Planner targeted mode — validation and generic regression", () => {
  it("lets a targeted week keep one Audience while generic rotation still fails", () => {
    assert.equal(
      SOCIAL_PLANNER_DIVERSITY_DEFAULTS.minDistinctAudiencesWhenMultiplePersonas,
      2,
    );
    assert.equal(
      resolveDiversityPolicy(null).minDistinctAudiencesWhenMultiplePersonas,
      2,
    );

    const genericContext = buildGenerationContext();
    assert.equal(genericContext.primaryTargetAudience, undefined);
    assert.ok(genericContext.personas.includedCount >= 2);
    const genericSingle = buildValidPackageRaw(
      genericContext,
      genericContext.calendarContext.period.dates.map(() => ({
        audience: "Local families",
        personaIds: ["persona-parent"],
        sourceSignals: [
          { type: "organization", id: TEST_ORG },
          { type: "persona", id: "persona-parent" },
        ],
      })),
    );
    try {
      validateAndNormalizeSocialCalendarPackage({
        raw: genericSingle,
        context: genericContext,
        userGuidance: null,
        metadata: testMetadata(),
      });
      throw new Error("expected generic single-audience week to fail");
    } catch (error) {
      assert.ok(error instanceof SocialCalendarPackageValidationError);
      assert.ok(
        error.failures.some((failure) =>
          /must rotate audiences when multiple Personas exist/i.test(failure),
        ),
      );
    }

    const rotating = validateAndNormalizeSocialCalendarPackage({
      raw: buildValidPackageRaw(genericContext),
      context: genericContext,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.equal(rotating.assets.length, 7);
    assert.ok(
      new Set(rotating.assets.flatMap((asset) => asset.personaIds)).size >= 2,
    );

    const targetedContext = targetedGenerationContext();
    const targetedPkg = validateAndNormalizeSocialCalendarPackage({
      raw: targetedSingleAudiencePackage(targetedContext),
      context: targetedContext,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.equal(targetedPkg.assets.length, 7);
    assert.deepEqual(
      [...new Set(targetedPkg.assets.flatMap((asset) => asset.personaIds))],
      [TARGET_ID],
    );
    assert.ok(
      new Set(targetedPkg.assets.map((asset) => asset.audience)).size >= 2,
    );
    assert.ok(
      targetedPkg.assets.every((asset) =>
        TARGETED_AUDIENCE_WORDING.includes(asset.audience),
      ),
    );

    const leaked = targetedSingleAudiencePackage(targetedContext);
    (leaked.assets as Array<Record<string, unknown>>)[4] = {
      ...(leaked.assets as Array<Record<string, unknown>>)[4],
      personaIds: [SECONDARY_ID],
      sourceSignals: [
        { type: "organization", id: TEST_ORG },
        { type: "persona", id: SECONDARY_ID },
      ],
    };
    try {
      validateAndNormalizeSocialCalendarPackage({
        raw: leaked,
        context: targetedContext,
        userGuidance: null,
        metadata: testMetadata(),
      });
      throw new Error("expected secondary Persona target to fail");
    } catch (error) {
      assert.ok(error instanceof SocialCalendarPackageValidationError);
      assert.ok(
        error.failures.some((failure) =>
          /must not assign a Persona other than the primary target/i.test(
            failure,
          ),
        ),
      );
    }

    const okStrategy = buildValidStrategyRaw(targetedContext);
    for (const entry of okStrategy.audiencePlan as Array<{ personaId: string }>) {
      entry.personaId = TARGET_ID;
    }
    const validatedStrategy = validateSocialPlannerWeeklyStrategy(
      okStrategy,
      targetedContext,
    );
    assert.ok(
      validatedStrategy.audiencePlan.every(
        (entry) => entry.personaId === TARGET_ID,
      ),
    );

    const strategy = buildValidStrategyRaw(targetedContext);
    (strategy.audiencePlan as Array<{ personaId: string }>)[1].personaId =
      SECONDARY_ID;
    assert.throws(
      () => validateSocialPlannerWeeklyStrategy(strategy, targetedContext),
      SocialPlannerStrategyValidationError,
    );
  });
});

describe("Social Planner targeted mode — repair isolation", () => {
  it("keeps targeted repair from reintroducing audience rotation and leaves generic repair unchanged", () => {
    const genericContext = buildGenerationContext();
    const targetedContext = targetedGenerationContext();
    const genericRepair = buildSocialPlannerRepairPrompt({
      context: genericContext,
      userGuidance: null,
      strategy: buildValidStrategyRaw(genericContext) as never,
      invalidPackage: { schemaVersion: "social_calendar_package_v1" },
      failures: ["Weekly portfolio must rotate audiences when multiple Personas exist."],
    });
    const targetedRepair = buildSocialPlannerRepairPrompt({
      context: targetedContext,
      userGuidance: null,
      strategy: buildValidStrategyRaw(targetedContext) as never,
      invalidPackage: { schemaVersion: "social_calendar_package_v1" },
      failures: ["assets[0].hook exceeds 160 characters."],
    });
    const genericDiversity = buildSocialPlannerDiversityRepairPrompt({
      context: genericContext,
      userGuidance: null,
      socialMemory: emptySocialMemory(),
      currentPackage: buildValidPackageRaw(genericContext),
      diversity: failingDiversity(),
    });
    const targetedDiversity = buildSocialPlannerDiversityRepairPrompt({
      context: targetedContext,
      userGuidance: null,
      socialMemory: emptySocialMemory(),
      currentPackage: targetedSingleAudiencePackage(targetedContext),
      diversity: failingDiversity(),
    });

    assert.doesNotMatch(genericRepair, /PRIMARY TARGET AUDIENCE \(TRUSTED\)/);
    assert.doesNotMatch(genericRepair, /Do not introduce audience rotation/);
    assert.match(
      genericDiversity,
      /You may change formats, hooks, angles, archetypes, audiences/,
    );
    assert.match(targetedRepair, /=== PRIMARY TARGET AUDIENCE \(TRUSTED\) ===/);
    assert.match(
      targetedRepair,
      /Do not introduce audience rotation or another Persona ID/,
    );
    assert.doesNotMatch(
      targetedDiversity,
      /You may change formats, hooks, angles, archetypes, audiences/,
    );
    assert.match(targetedDiversity, /Do not rotate the primary Audience/);
    assert.match(targetedDiversity, /Do not reintroduce audience diversity/);
  });
});

describe("Social Planner targeted mode — optional direction contract", () => {
  it("keeps generic userGuidance semantics and max length", () => {
    const long = "x".repeat(SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS);
    const ok = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      userGuidance: long,
    });
    assert.equal(ok.userGuidance, long);
    assert.equal(ok.personaId, null);
    assert.throws(() =>
      normalizeSocialCalendarCreateRequest({
        periodStart: TEST_PERIOD_START,
        userGuidance: `${long}y`,
      }),
    );
    const generic = buildSocialPlannerStrategyPrompt({
      context: buildGenerationContext(),
      userGuidance: "Theme the week around a patio offer",
    });
    assert.match(generic, /<<<BEGIN_USER_GUIDANCE>>>/);
    assert.match(generic, /Theme the week around a patio offer/);
    assert.doesNotMatch(generic, /PRIMARY TARGET AUDIENCE \(TRUSTED\)/);
  });
});

describe("Social Planner targeted mode — i18n", () => {
  it("adds Target audience and Clear in all six locales", () => {
    assert.equal(en.socialPlanner.targetAudience, "Target audience");
    assert.equal(en.socialPlanner.clear, "Clear");
    assert.notEqual(fr.socialPlanner.targetAudience, en.socialPlanner.targetAudience);
    assert.notEqual(es.socialPlanner.targetAudience, en.socialPlanner.targetAudience);
    assert.notEqual(itMessages.socialPlanner.targetAudience, en.socialPlanner.targetAudience);
    assert.notEqual(de.socialPlanner.targetAudience, en.socialPlanner.targetAudience);
    assert.notEqual(pt.socialPlanner.targetAudience, en.socialPlanner.targetAudience);
    assert.notEqual(fr.socialPlanner.clear, en.socialPlanner.clear);
    assert.notEqual(es.socialPlanner.clear, en.socialPlanner.clear);
    assert.notEqual(itMessages.socialPlanner.clear, en.socialPlanner.clear);
    assert.notEqual(de.socialPlanner.clear, en.socialPlanner.clear);
    assert.notEqual(pt.socialPlanner.clear, en.socialPlanner.clear);
  });
});
