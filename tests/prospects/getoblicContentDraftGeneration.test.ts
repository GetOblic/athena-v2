/**
 * Independent GetOblic Description and Knowledge Base drafts.
 * Provider calls are mocked. No live model traffic.
 */

import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import type { Discussion } from "../../services/discussionService";
import type { ExecutiveIntelligenceVersion } from "../../services/executiveVersions/executiveVersionTypes";
import {
  GETOBLIC_DESCRIPTION_MAX_CHARS,
  GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
  generateProspectGetoblicDescription,
} from "../../services/prospects/prospectGetoblicDescription";
import {
  GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS,
  GetoblicContentDraftError,
  buildGetoblicKnowledgeBaseSystemPrompt,
  formatGetoblicDescriptionDraftUserPrompt,
  formatGetoblicKnowledgeBaseDraftUserPrompt,
  generateClientGetoblicDescriptionDraft,
  generateClientGetoblicKnowledgeBaseDraft,
  generateProspectGetoblicDescriptionDraft,
  generateProspectGetoblicKnowledgeBaseDraft,
  validateGetoblicKnowledgeBaseDraft,
} from "../../services/prospects/getoblicContentDraftGeneration";
import {
  loadGetoblicContentGenerationContext,
  type GetoblicContentGenerationContextDeps,
} from "../../services/prospects/getoblicContentGenerationContext";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const CLIENT_ORG = "44444444-4444-4444-8444-444444444444";
const FOREIGN_CLIENT = "55555555-5555-4555-8555-555555555555";
const SOURCE_ORG = "33333333-3333-4333-8333-333333333333";
const FOREIGN_ORG = "99999999-9999-4999-8999-999999999999";
const LICENSEE_ID = "11111111-1111-4111-8111-111111111111";
const PROSPECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DISCUSSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CURRENT_VERSION_ID = "ev-current";

const CURRENT_SUMMARY = "CURRENT_SUMMARY Harbor dentistry for families from $99.";
const HISTORICAL_SUMMARY = "HISTORICAL_SUMMARY_SECRET";
const PAGE_SECRET = "PAGE_LIST_SECRET";
const BRAIN_SECRET = "CLIENT_BRAIN_SECRET";
const BLUEPRINT_SECRET = "BLUEPRINT_SECRET_DO_NOT_COPY";
const DEPLOYMENT_SECRET = "DEPLOYMENT_ASSET_SECRET";
const NOTE_SECRET = "OPERATOR_NOTE_SECRET";
const DISCUSSION_BODY = "DISCUSSION_BODY_SECRET";
const RAW_JSON_SECRET = "RAW_JSON_SECRET";

const DESCRIPTION_TEXT =
  "Harbor Practice provides family dentistry in the harbor district.";
const KNOWLEDGE_BASE_TEXT = [
  "## Business Overview",
  "- Harbor Practice provides family dentistry.",
  "",
  "## Services and Products",
  "- Cleanings and exams.",
].join("\n");

type VersionInput = {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  organizationId?: string;
  discussionId?: string;
  summary?: string;
  intelligence?: Record<string, unknown>;
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function version(input: VersionInput): ExecutiveIntelligenceVersion {
  return {
    id: input.id,
    discussion_id: input.discussionId ?? DISCUSSION_ID,
    organization_id: input.organizationId ?? SOURCE_ORG,
    user_id: null,
    version_number: input.versionNumber,
    is_current: input.isCurrent,
    generated_at: "2026-10-01T00:00:00.000Z",
    generation_duration_ms: null,
    models_used: null,
    routing_profile: null,
    reasoning_profile: null,
    reasoning_effort: null,
    pipeline_version: "executive_intelligence_v1",
    regeneration_run_id: null,
    analysis_id: null,
    opportunity_id: null,
    review_id: null,
    blueprint_id: null,
    created_at: "2026-10-01T00:00:00.000Z",
    intelligence: (input.intelligence ?? {
      analysis: {
        id: input.id,
        summary: input.summary ?? "",
        confidence: 10,
      },
    }) as ExecutiveIntelligenceVersion["intelligence"],
  };
}

function currentIntelligence(): Record<string, unknown> {
  return {
    generationMode: "think_differently",
    analysis: {
      id: "analysis-current",
      summary: CURRENT_SUMMARY,
      pain_points: "No online booking.",
      intent: "Book a visit.",
      confidence: 91,
      suggested_cta: DEPLOYMENT_SECRET,
      raw_json: { secret: RAW_JSON_SECRET },
    },
    opportunity: {
      title: "Booking gap",
      reason: "The site has no scheduler.",
      recommended_action: "Offer a visit.",
    },
    briefing: {
      summary: "Families want evening visits.",
      recommended_response: "Send a sales sequence.",
    },
    blueprint: {
      asset_title: BLUEPRINT_SECRET,
      notes: BLUEPRINT_SECRET,
      business_goal: BLUEPRINT_SECRET,
    },
  };
}

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: PROSPECT_ID,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    organization_id: SOURCE_ORG,
    user_id: null,
    community_id: null,
    linked_discussion_id: DISCUSSION_ID,
    business_name: "Harbor Practice",
    website: "https://harbor.example",
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: "Dentistry",
    category: "Clinic",
    country: "US",
    state: "CA",
    city: "Harbor",
    address: "10 Dock Street",
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: null,
    decision_maker: null,
    first_name: null,
    last_name: null,
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: "hello@harbor.example",
    phone: "555-0100",
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: NOTE_SECRET,
    additional_context: "Evening hours on Thursday.",
    source: "manual",
    status: "Ready",
    lifecycle_status: "New",
    ads_content: null,
    opportunity_score: null,
    priority: 0,
    website_intelligence: {
      provider: "deep_v1",
      url: "https://harbor.example",
      about: "Harbor Practice provides family dentistry.",
      services: "Cleanings and exams.",
      master_profile: BRAIN_SECRET,
      pages: [
        {
          url: "https://harbor.example/secret",
          title: PAGE_SECRET,
          excerpt: PAGE_SECRET,
        },
      ],
      business_knowledge: {
        about: "Family dentistry with evening hours.",
      },
    },
    raw_json: null,
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

function discussion(): Discussion {
  return {
    id: DISCUSSION_ID,
    organization_id: SOURCE_ORG,
    platform: "prospect_intelligence",
    title: "Original prospect discussion",
    summary: "Practice overview",
    body: DISCUSSION_BODY,
  } as Discussion;
}

function currentVersion(): ExecutiveIntelligenceVersion {
  return version({
    id: CURRENT_VERSION_ID,
    versionNumber: 2,
    isCurrent: true,
    intelligence: currentIntelligence(),
  });
}

function historicalVersion(): ExecutiveIntelligenceVersion {
  return version({
    id: "ev-history",
    versionNumber: 1,
    isCurrent: false,
    summary: HISTORICAL_SUMMARY,
  });
}

function deps(
  versions: ExecutiveIntelligenceVersion[],
  prospectRow: Prospect = prospect(),
): GetoblicContentGenerationContextDeps {
  return {
    getProspect: async (id, organizationId) =>
      prospectRow.id === id && prospectRow.organization_id === organizationId
        ? prospectRow
        : null,
    getDiscussion: async (id, organizationId) =>
      id === DISCUSSION_ID && organizationId === SOURCE_ORG ? discussion() : null,
    listExecutiveVersions: async (discussionId, organizationId) =>
      versions.filter(
        (item) =>
          item.discussion_id === discussionId &&
          item.organization_id === organizationId,
      ),
  };
}

function assertNoLeak(value: string) {
  assert.equal(value.includes(PROSPECT_ID), false);
  assert.equal(value.includes(SOURCE_ORG), false);
  assert.equal(value.includes(CLIENT_ORG), false);
  assert.equal(value.includes(FOREIGN_ORG), false);
  assert.equal(value.includes(BRAIN_SECRET), false);
  assert.equal(value.includes(PAGE_SECRET), false);
  assert.equal(value.includes(HISTORICAL_SUMMARY), false);
  assert.equal(value.includes(BLUEPRINT_SECRET), false);
  assert.equal(value.includes(DEPLOYMENT_SECRET), false);
  assert.equal(value.includes(DISCUSSION_BODY), false);
  assert.equal(value.includes(RAW_JSON_SECRET), false);
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
let writes: string[] = [];
let queries: Array<{ table: string; filters: Record<string, string> }> = [];

type Fixture = {
  conversions: Array<Record<string, unknown>>;
  prospects: Array<Record<string, unknown>>;
  discussions: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
};

function install(fixture: Fixture) {
  writes = [];
  queries = [];
  (supabaseAdmin as unknown as { from: (table: string) => unknown }).from = (
    table: string,
  ) => {
    const filters: Record<string, string> = {};
    let limitCount: number | null = null;
    const finish = () => {
      queries.push({ table, filters: { ...filters } });
      const source =
        table === "licensee_prospect_client_conversions"
          ? fixture.conversions
          : table === "prospects"
            ? fixture.prospects
            : table === "discussions"
              ? fixture.discussions
              : table === "athena_executive_intelligence_versions"
                ? fixture.versions
                : [];
      const rows = source.filter((row) =>
        Object.entries(filters).every(([column, value]) => row[column] === value),
      );
      return limitCount == null ? rows : rows.slice(0, limitCount);
    };
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      order() {
        return builder;
      },
      limit(count: number) {
        limitCount = count;
        return builder;
      },
      insert() {
        writes.push(`${table}.insert`);
        return builder;
      },
      update() {
        writes.push(`${table}.update`);
        return builder;
      },
      delete() {
        writes.push(`${table}.delete`);
        return builder;
      },
      upsert() {
        writes.push(`${table}.upsert`);
        return builder;
      },
      async maybeSingle() {
        const rows = finish();
        if (rows.length > 1) {
          return { data: null, error: { message: "multiple rows" } };
        }
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = finish();
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: "missing" } };
      },
      then(
        onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: finish(), error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return builder;
  };
}

function restore() {
  (supabaseAdmin as unknown as { from: typeof supabaseAdmin.from }).from =
    originalFrom;
}

function activeConversion(overrides: Record<string, unknown> = {}) {
  return {
    prospect_id: PROSPECT_ID,
    source_organization_id: SOURCE_ORG,
    client_organization_id: CLIENT_ORG,
    licensee_account_id: LICENSEE_ID,
    licensee_sub_account_id: null,
    status: "active",
    ...overrides,
  };
}

function storedProspect(overrides: Record<string, unknown> = {}) {
  return {
    ...prospect(),
    ...overrides,
  };
}

function storedVersion(input: VersionInput) {
  return version(input);
}

describe("GetOblic content generation context", () => {
  afterEach(() => {
    restore();
  });

  it("uses one current source version, prospect facts, and bounded website intelligence", async () => {
    const context = await loadGetoblicContentGenerationContext(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      deps([historicalVersion(), currentVersion()]),
    );

    assert.equal(context.executiveVersionId, CURRENT_VERSION_ID);
    assert.equal(context.sourceOrganizationId, SOURCE_ORG);
    assert.equal(context.identity.name, "Harbor Practice");
    assert.equal(context.identity.city, "Harbor");
    assert.equal(context.businessFacts.notes, NOTE_SECRET);
    assert.equal(context.usesDeepWebsiteIntelligence, true);
    assert.match(context.executiveFacts.summary ?? "", /CURRENT_SUMMARY/);
    assert.match(context.websiteIntelligence.about ?? "", /family dentistry/);
    assert.equal(context.websiteIntelligence.services, "Cleanings and exams.");
    const serialized = JSON.stringify(context);
    assertNoLeak(serialized.replaceAll(SOURCE_ORG, "").replaceAll(PROSPECT_ID, ""));
    assert.equal(serialized.includes(HISTORICAL_SUMMARY), false);
    assert.equal(serialized.includes(PAGE_SECRET), false);
    assert.equal(serialized.includes(BRAIN_SECRET), false);
    assert.equal(serialized.includes(BLUEPRINT_SECRET), false);
    assert.equal(serialized.includes(DEPLOYMENT_SECRET), false);
    assert.equal(serialized.includes("pages"), false);
    assert.equal(serialized.includes("suggested_cta"), false);
    assert.equal(serialized.includes("recommended_action"), false);
  });

  it("returns the same unavailable error when the current version is missing or ambiguous", async () => {
    const missing = loadGetoblicContentGenerationContext(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      deps([historicalVersion()]),
    );
    const ambiguous = loadGetoblicContentGenerationContext(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      deps([
        currentVersion(),
        version({
          id: "ev-also-current",
          versionNumber: 3,
          isCurrent: true,
          summary: "SECOND_CURRENT_SECRET",
        }),
      ]),
    );
    const foreignOnly = loadGetoblicContentGenerationContext(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      deps([
        version({
          id: "ev-foreign",
          versionNumber: 4,
          isCurrent: true,
          organizationId: FOREIGN_ORG,
          summary: "FOREIGN_VERSION_SECRET",
        }),
      ]),
    );

    for (const pending of [missing, ambiguous, foreignOnly]) {
      await assert.rejects(
        pending,
        (error: unknown) =>
          error instanceof GetoblicContentDraftError &&
          error.code === "CURRENT_EXECUTIVE_VERSION_UNAVAILABLE" &&
          error.httpStatus === 409,
      );
    }
  });

  it("does not load a prospect from another organization", async () => {
    await assert.rejects(
      () =>
        loadGetoblicContentGenerationContext(
          { prospectId: PROSPECT_ID, sourceOrganizationId: FOREIGN_ORG },
          deps([currentVersion()]),
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError && error.code === "NOT_FOUND",
    );
  });
});

describe("GetOblic description draft generation", () => {
  it("returns validated text from the current version and does not persist", async () => {
    let calls = 0;
    let prompt = "";
    const result = await generateProspectGetoblicDescriptionDraft(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      {
        ...deps([historicalVersion(), currentVersion()]),
        generateReview: async (userPrompt, meta) => {
          calls += 1;
          prompt = userPrompt;
          assert.equal(meta?.systemPrompt, GETOBLIC_DESCRIPTION_SYSTEM_PROMPT);
          assert.equal(meta?.generationKind, "generic_review");
          assert.equal(meta?.athenaStage, "generic_review");
          return DESCRIPTION_TEXT;
        },
      },
    );

    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.artifact, "description");
    assert.equal(result.text, DESCRIPTION_TEXT);
    assert.equal(result.executiveVersionId, CURRENT_VERSION_ID);
    assert.deepEqual(Object.keys(result).sort(), [
      "artifact",
      "executiveVersionId",
      "ok",
      "text",
    ]);
    assert.match(prompt, /Harbor Practice provides family dentistry/);
    assert.match(prompt, /CURRENT_SUMMARY/);
    assert.doesNotMatch(prompt, /\$99/);
    assertNoLeak(prompt);
    assert.equal(prompt.includes(NOTE_SECRET), false);
  });

  it("enforces the existing 4000-character description cap", async () => {
    const result = await generateProspectGetoblicDescriptionDraft(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      {
        ...deps([currentVersion()]),
        generateReview: async () => "A".repeat(GETOBLIC_DESCRIPTION_MAX_CHARS + 80),
      },
    );
    assert.equal(GETOBLIC_DESCRIPTION_MAX_CHARS, 4000);
    assert.equal(result.text.length, GETOBLIC_DESCRIPTION_MAX_CHARS);
  });

  it("rejects malformed description output without writing", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        generateProspectGetoblicDescriptionDraft(
          { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
          {
            ...deps([currentVersion()]),
            generateReview: async () => {
              calls += 1;
              return "STAGE 1 — FACT SELECTION\nAcme remains a clinic.";
            },
          },
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "INVALID_OUTPUT" &&
        error.httpStatus === 502,
    );
    assert.equal(calls, 1);
  });

  it("does not call the provider when the current version is missing or ambiguous", async () => {
    let calls = 0;
    const generateReview = async () => {
      calls += 1;
      return DESCRIPTION_TEXT;
    };
    await assert.rejects(
      () =>
        generateProspectGetoblicDescriptionDraft(
          { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
          { ...deps([historicalVersion()]), generateReview },
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "CURRENT_EXECUTIVE_VERSION_UNAVAILABLE",
    );
    await assert.rejects(
      () =>
        generateProspectGetoblicDescriptionDraft(
          { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
          {
            ...deps([
              currentVersion(),
              version({
                id: "ev-also-current",
                versionNumber: 3,
                isCurrent: true,
              }),
            ]),
            generateReview,
          },
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "CURRENT_EXECUTIVE_VERSION_UNAVAILABLE",
    );
    assert.equal(calls, 0);
  });

  it("requires stored website intelligence before the provider call", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        generateProspectGetoblicDescriptionDraft(
          { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
          {
            ...deps(
              [currentVersion()],
              prospect({ website_intelligence: { provider: "deep_v1", pages: [] } }),
            ),
            generateReview: async () => {
              calls += 1;
              return DESCRIPTION_TEXT;
            },
          },
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "WEBSITE_INTELLIGENCE_REQUIRED",
    );
    assert.equal(calls, 0);
  });
});

describe("GetOblic knowledge base draft generation", () => {
  it("returns one knowledge base body from current intelligence and website research", async () => {
    let calls = 0;
    let prompt = "";
    let systemPrompt = "";
    const result = await generateProspectGetoblicKnowledgeBaseDraft(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      {
        ...deps([historicalVersion(), currentVersion()]),
        generateReview: async (userPrompt, meta) => {
          calls += 1;
          prompt = userPrompt;
          systemPrompt = meta?.systemPrompt ?? "";
          assert.equal(meta?.generationKind, "generic_review");
          assert.equal(meta?.athenaStage, "generic_review");
          return KNOWLEDGE_BASE_TEXT;
        },
      },
    );

    assert.equal(calls, 1);
    assert.equal(result.artifact, "knowledge_base");
    assert.equal(result.text, KNOWLEDGE_BASE_TEXT);
    assert.equal(result.executiveVersionId, CURRENT_VERSION_ID);
    assert.match(prompt, /CURRENT_SUMMARY/);
    assert.match(prompt, /\$99/);
    assert.match(prompt, /OPERATOR_NOTE_SECRET/);
    assert.match(prompt, /family dentistry/);
    assert.match(systemPrompt, /Deep Knowledge Base rules/);
    assert.match(systemPrompt, /Never invent/i);
    assertNoLeak(prompt);
  });

  it("uses the standard knowledge base rules when research is not deep", async () => {
    let systemPrompt = "";
    await generateProspectGetoblicKnowledgeBaseDraft(
      { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
      {
        ...deps(
          [currentVersion()],
          prospect({
            website_intelligence: {
              provider: "homepage",
              about: "Harbor Practice provides family dentistry.",
            },
          }),
        ),
        generateReview: async (_prompt, meta) => {
          systemPrompt = meta?.systemPrompt ?? "";
          return KNOWLEDGE_BASE_TEXT;
        },
      },
    );
    assert.match(systemPrompt, /Team and Expertise/);
    assert.doesNotMatch(systemPrompt, /Leadership \/ Practitioners/);
    assert.match(
      buildGetoblicKnowledgeBaseSystemPrompt(false),
      /Omit unknown/i,
    );
  });

  it("rejects empty, malformed, contaminated, and unsupported knowledge base output", () => {
    const samples = [
      "",
      "```\nKNOWLEDGE_BASE_ENHANCEMENT:\n```",
      "A single sentence with no sections.",
      "## Business Overview\n## Services and Products",
      '{"analysis":{"summary":"secret"}}',
      "## Business Overview\n- STAGE 1 fact selection for this clinic.",
      "## Business Overview\n- The Client Brain says the practice is open daily.",
      "## Business Overview\n- Athena prepared this internal note for the team.",
    ];
    for (const sample of samples) {
      assert.throws(
        () => validateGetoblicKnowledgeBaseDraft(sample),
        (error: unknown) =>
          error instanceof GetoblicContentDraftError &&
          error.code === "INVALID_OUTPUT",
      );
    }
  });

  it("rejects a knowledge base above the 20000-character limit", () => {
    const oversized = `## Business Overview\n- ${"K".repeat(GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS)}`;
    assert.equal(GETOBLIC_KNOWLEDGE_BASE_MAX_CHARS, 20_000);
    assert.throws(
      () => validateGetoblicKnowledgeBaseDraft(oversized),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "OUTPUT_LIMIT_EXCEEDED" &&
        error.httpStatus === 422,
    );
  });

  it("maps provider timeout and provider failure without a retry", async () => {
    let timeouts = 0;
    await assert.rejects(
      () =>
        generateProspectGetoblicKnowledgeBaseDraft(
          {
            prospectId: PROSPECT_ID,
            sourceOrganizationId: SOURCE_ORG,
            timeoutMs: 20,
          },
          {
            ...deps([currentVersion()]),
            generateReview: (_prompt, meta) =>
              new Promise((_resolve, reject) => {
                timeouts += 1;
                const signal = meta?.signal;
                if (!signal) {
                  reject(new Error("missing signal"));
                  return;
                }
                signal.addEventListener("abort", () => {
                  const error = new Error("timed out");
                  error.name = "TimeoutError";
                  reject(error);
                });
              }),
          },
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "GENERATION_TIMEOUT" &&
        error.httpStatus === 504,
    );

    let failures = 0;
    await assert.rejects(
      () =>
        generateProspectGetoblicDescriptionDraft(
          { prospectId: PROSPECT_ID, sourceOrganizationId: SOURCE_ORG },
          {
            ...deps([currentVersion()]),
            generateReview: async () => {
              failures += 1;
              throw new Error("provider unavailable");
            },
          },
        ),
      (error: unknown) =>
        error instanceof GetoblicContentDraftError &&
        error.code === "GENERATION_FAILED",
    );
    assert.equal(timeouts, 1);
    assert.equal(failures, 1);
  });
});

describe("GetOblic draft authorization", () => {
  afterEach(() => {
    restore();
  });

  it("keeps the prospect sync_ai Free guard in front of draft generation", () => {
    for (const relativePath of [
      "app/api/prospects/[id]/getoblic-content-draft/description/route.ts",
      "app/api/prospects/[id]/getoblic-content-draft/knowledge-base/route.ts",
    ]) {
      const route = read(relativePath);
      const guardAt = route.indexOf("assertCurrentFreeConvertGeneration");
      const generateAt = route.search(/generateProspectGetoblic\w+Draft/);
      assert.ok(guardAt >= 0);
      assert.ok(generateAt > guardAt);
      assert.match(route, /action:\s*"sync_ai"/);
      assert.match(route, /prospectId:\s*id/);
      assert.match(route, /sourceOrganizationId:\s*organizationId/);
      assert.match(route, /maxDuration = 60/);
      assert.doesNotMatch(route, /request\.json|searchParams/);
    }

    const denied = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "consumed",
      action: "sync_ai",
      prospectId: PROSPECT_ID,
      boundProspectId: PROSPECT_ID,
    });
    assert.equal(denied.allow, false);
    if (!denied.allow) {
      assert.equal(denied.code, "FREE_CONVERT_SYNC_DENIED");
    }
    const allowed = evaluateFreeConvertGeneration({
      athenaPlan: "full",
      defineKind: "ready",
      convertStatus: "consumed",
      action: "sync_ai",
      prospectId: PROSPECT_ID,
    });
    assert.equal(allowed.allow, true);
  });

  it("authorizes the client from one active conversion and omits source identifiers", async () => {
    let calls = 0;
    const result = await generateClientGetoblicDescriptionDraft(
      { clientOrganizationId: CLIENT_ORG },
      {
        ...deps([currentVersion()]),
        resolveAuthority: async () => ({
          ok: true,
          conversion: {
            prospectId: PROSPECT_ID,
            sourceOrganizationId: SOURCE_ORG,
            clientOrganizationId: CLIENT_ORG,
            licenseeAccountId: LICENSEE_ID,
            licenseeSubAccountId: null,
            status: "active",
          },
        }),
        generateReview: async () => {
          calls += 1;
          return DESCRIPTION_TEXT;
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.executiveVersionId, CURRENT_VERSION_ID);
    assertNoLeak(JSON.stringify(result));
    assert.equal(JSON.stringify(result).includes("prospectId"), false);
    assert.equal(JSON.stringify(result).includes("sourceOrganizationId"), false);
  });

  it("denies reversed, foreign, and ambiguous client sessions before provider work", async () => {
    let calls = 0;
    const generateReview = async () => {
      calls += 1;
      return DESCRIPTION_TEXT;
    };
    const reasons = [
      "no_active_conversion",
      "ambiguous_conversion",
      "client_mismatch",
      "source_mismatch",
    ] as const;
    for (const reason of reasons) {
      await assert.rejects(
        () =>
          generateClientGetoblicKnowledgeBaseDraft(
            { clientOrganizationId: CLIENT_ORG },
            {
              resolveAuthority: async () => ({ ok: false, reason }),
              generateReview,
              getProspect: async () => {
                throw new Error("prospect should not be loaded");
              },
            },
          ),
        (error: unknown) =>
          error instanceof GetoblicContentDraftError &&
          error.code === "CONVERSION_UNAVAILABLE" &&
          error.httpStatus === 404 &&
          !error.message.includes(PROSPECT_ID),
      );
    }
    assert.equal(calls, 0);
  });

  it("resolves the source organization on the server and does not write", async () => {
    install({
      conversions: [activeConversion()],
      prospects: [storedProspect()],
      discussions: [
        {
          id: DISCUSSION_ID,
          organization_id: SOURCE_ORG,
          platform: "prospect_intelligence",
          title: "Original prospect discussion",
          body: DISCUSSION_BODY,
        },
      ],
      versions: [
        storedVersion({
          id: CURRENT_VERSION_ID,
          versionNumber: 2,
          isCurrent: true,
          intelligence: currentIntelligence(),
        }),
        storedVersion({
          id: "ev-history",
          versionNumber: 1,
          isCurrent: false,
          summary: HISTORICAL_SUMMARY,
        }),
        storedVersion({
          id: "ev-foreign",
          versionNumber: 9,
          isCurrent: true,
          organizationId: FOREIGN_ORG,
          summary: "FOREIGN_VERSION_SECRET",
        }),
      ],
    });

    let calls = 0;
    const result = await generateClientGetoblicKnowledgeBaseDraft(
      { clientOrganizationId: CLIENT_ORG },
      {
        generateReview: async (prompt) => {
          calls += 1;
          assert.match(prompt, /CURRENT_SUMMARY/);
          assert.equal(prompt.includes(HISTORICAL_SUMMARY), false);
          assert.equal(prompt.includes("FOREIGN_VERSION_SECRET"), false);
          assert.equal(prompt.includes(BRAIN_SECRET), false);
          return KNOWLEDGE_BASE_TEXT;
        },
      },
    );

    assert.equal(calls, 1);
    assert.equal(result.executiveVersionId, CURRENT_VERSION_ID);
    assertNoLeak(JSON.stringify(result));
    assert.deepEqual(writes, []);
    assert.equal(
      queries.some(
        (query) =>
          query.table === "prospects" &&
          query.filters.id === PROSPECT_ID &&
          query.filters.organization_id === SOURCE_ORG,
      ),
      true,
    );
    assert.equal(
      queries.some(
        (query) =>
          query.table === "prospects" &&
          query.filters.organization_id === CLIENT_ORG,
      ),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "athena_identity"),
      false,
    );
    assert.equal(
      queries.some((query) => query.table === "athena_executive_intelligence_versions" && query.filters.organization_id === SOURCE_ORG),
      true,
    );
  });

  it("stops reversed, foreign, and ambiguous client lookups before the prospect read", async () => {
    const cases: Fixture[] = [
      {
        conversions: [activeConversion({ status: "reversed" })],
        prospects: [storedProspect()],
        discussions: [],
        versions: [],
      },
      {
        conversions: [activeConversion()],
        prospects: [storedProspect()],
        discussions: [],
        versions: [],
      },
      {
        conversions: [
          activeConversion(),
          activeConversion({
            prospect_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          }),
        ],
        prospects: [storedProspect()],
        discussions: [],
        versions: [],
      },
    ];
    const clients = [CLIENT_ORG, FOREIGN_CLIENT, CLIENT_ORG];
    for (let index = 0; index < cases.length; index += 1) {
      install(cases[index]);
      let calls = 0;
      await assert.rejects(
        () =>
          generateClientGetoblicDescriptionDraft(
            { clientOrganizationId: clients[index] },
            {
              generateReview: async () => {
                calls += 1;
                return DESCRIPTION_TEXT;
              },
            },
          ),
        (error: unknown) =>
          error instanceof GetoblicContentDraftError &&
          error.code === "CONVERSION_UNAVAILABLE",
      );
      assert.equal(calls, 0);
      assert.equal(
        queries.some((query) => query.table === "prospects"),
        false,
      );
      assert.equal(
        queries.some((query) => query.table === "athena_identity"),
        false,
      );
      assert.deepEqual(writes, []);
    }
  });
});

describe("GetOblic draft boundaries", () => {
  it("keeps the public description route on generate-and-persist", async () => {
    let persisted = 0;
    let prompt = "";
    const generated = await generateProspectGetoblicDescription(
      { prospectId: PROSPECT_ID, organizationId: SOURCE_ORG },
      {
        getProspect: async () => prospect(),
        generateReview: async (userPrompt, meta) => {
          prompt = userPrompt;
          assert.equal(meta?.systemPrompt, GETOBLIC_DESCRIPTION_SYSTEM_PROMPT);
          assert.equal(meta?.signal, undefined);
          return DESCRIPTION_TEXT;
        },
        persistGeneratedListingDescription: async (_current, value) => {
          persisted += 1;
          return value;
        },
        now: () => "2026-10-18T00:00:00.000Z",
      },
    );

    assert.equal(persisted, 1);
    assert.equal(generated.description, DESCRIPTION_TEXT);
    assert.equal(generated.generatedAt, "2026-10-18T00:00:00.000Z");
    assert.match(prompt, /family dentistry/);
    assert.equal(prompt.includes(CURRENT_SUMMARY), false);
    assert.equal(prompt.includes(NOTE_SECRET), false);
    assert.equal(prompt.includes("recommended_action"), false);

    const route = read("app/api/prospects/[id]/getoblic-description/route.ts");
    const service = read("services/prospects/prospectGetoblicDescription.ts");
    assert.match(route, /generateProspectGetoblicDescription\(/);
    assert.match(route, /assertCurrentFreeConvertGeneration/);
    assert.match(route, /action:\s*"sync_ai"/);
    assert.match(service, /return persist\(prospect, generated\)/);
    assert.doesNotMatch(service, /loadGetoblicContentGenerationContext/);
    assert.match(service, /generateGetoblicDescriptionText/);
  });

  it("does not publish, fully regenerate, or expose client brain data", () => {
    const files = [
      "services/prospects/getoblicContentGenerationContext.ts",
      "services/prospects/getoblicContentDraftGeneration.ts",
      "app/api/prospects/[id]/getoblic-content-draft/description/route.ts",
      "app/api/prospects/[id]/getoblic-content-draft/knowledge-base/route.ts",
      "app/api/client-prospect-intelligence/getoblic-content-draft/description/route.ts",
      "app/api/client-prospect-intelligence/getoblic-content-draft/knowledge-base/route.ts",
    ].map(read);
    const combined = files.join("\n");
    assert.doesNotMatch(
      combined,
      /publishExecutiveIntelligenceVersion\s*\(|generateDeploymentAssets\s*\(|updateDiscussionAnalysisDeploymentFields\s*\(|ensureProspectGenerationQueued\s*\(|getoblicWordpressClient|from\("athena_identity"\)/,
    );
    assert.doesNotMatch(
      read("services/prospects/getoblicContentDraftGeneration.ts"),
      /\.update\(|\.insert\(|\.upsert\(|persistGeneratedListingDescription/,
    );
    assert.doesNotMatch(
      read("services/prospects/getoblicContentGenerationContext.ts"),
      /resolvedVersions\[0\]|versions\[0\]/,
    );

    const clientDescription = read(
      "app/api/client-prospect-intelligence/getoblic-content-draft/description/route.ts",
    );
    const clientKnowledge = read(
      "app/api/client-prospect-intelligence/getoblic-content-draft/knowledge-base/route.ts",
    );
    for (const route of [clientDescription, clientKnowledge]) {
      assert.doesNotMatch(
        route,
        /assertCurrentFreeConvertGeneration|freeConvert|request\.json|searchParams|prospectId|sourceOrganizationId/,
      );
      assert.match(route, /requireCurrentOrganizationContext/);
      assert.match(route, /clientOrganizationId:\s*organizationId/);
      assert.match(route, /maxDuration = 60/);
    }

    const prompt = formatGetoblicDescriptionDraftUserPrompt({
      identity: { name: "Harbor Practice", city: "Harbor", state: "CA", country: "US" },
      websiteIntelligence: { about: "Family dentistry." },
      executiveFacts: {
        summary: CURRENT_SUMMARY,
        painPoints: null,
        intent: null,
        opportunityTitle: null,
        opportunityReason: null,
        briefingSummary: null,
      },
    });
    assert.match(prompt, /CURRENT_SUMMARY/);
    assert.doesNotMatch(prompt, /\$99/);
    const knowledgePrompt = formatGetoblicKnowledgeBaseDraftUserPrompt({
      sourceOrganizationId: SOURCE_ORG,
      prospectId: PROSPECT_ID,
      discussionId: DISCUSSION_ID,
      executiveVersionId: CURRENT_VERSION_ID,
      identity: { name: "Harbor Practice", city: "Harbor", state: "CA", country: "US" },
      businessFacts: {
        industry: null,
        category: null,
        website: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        additionalContext: null,
      },
      websiteIntelligence: { about: "Family dentistry." },
      usesDeepWebsiteIntelligence: false,
      executiveFacts: {
        summary: null,
        painPoints: null,
        intent: null,
        opportunityTitle: null,
        opportunityReason: null,
        briefingSummary: null,
      },
    });
    assert.equal(knowledgePrompt.includes(PROSPECT_ID), false);
    assert.equal(knowledgePrompt.includes(SOURCE_ORG), false);
  });
});
