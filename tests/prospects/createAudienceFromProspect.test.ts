import "../personas/personaTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createAudienceFromProspect,
  CreateAudienceFromProspectError,
  PROSPECT_AUDIENCE_PROVENANCE,
} from "../../services/personas/createAudienceFromProspect";
import { PersonaGenerationError } from "../../services/personas/personaGeneration";
import { preparePersonaCreateRow } from "../../services/personas/personaNormalization";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG_ID = "org-33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "org-44444444-4444-4444-8444-444444444444";
const PROSPECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DISCUSSION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSONA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function stubProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: PROSPECT_ID,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    organization_id: ORG_ID,
    user_id: null,
    community_id: null,
    linked_discussion_id: DISCUSSION_ID,
    business_name: "Miami Glow Medical Spa",
    website: "https://miamiglow.example",
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: "Healthcare",
    category: "Medical Spa",
    country: "USA",
    state: "Florida",
    city: "Miami",
    address: null,
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
    job_title: "Owner",
    email: null,
    phone: null,
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: null,
    additional_context: null,
    source: "manual",
    status: "active",
    lifecycle_status: "active",
    ads_content: null,
    opportunity_score: 80,
    priority: 1,
    website_intelligence: null,
    raw_json: null,
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

const currentEv = {
  id: "ev-1",
  is_current: true,
  organization_id: ORG_ID,
  discussion_id: DISCUSSION_ID,
} as never;

const candidate = {
  persona_name: "Growth-Focused Med Spa Owner",
  occupation: "Owner",
  city: "Miami",
  state: "Florida",
  country: "USA",
  additional_context: "South Florida physician-led med spa operators",
  reference_website: "",
};

describe("create audience from Prospect — API contract", () => {
  it("uses session organization and ignores client organization id", () => {
    const route = read("app/api/prospects/[id]/create-audience/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /createAudienceFromProspect/);
    assert.match(route, /clientOrganizationId/);
    assert.match(route, /record\.organizationId \?\? record\.organization_id/);
    assert.match(route, /personaId/);
    assert.doesNotMatch(route, /personas\.prospect_id/);
    assert.doesNotMatch(route, /toPublicPersona/);
  });

  it("does not add a personas.prospect_id column or a migration", () => {
    const service = read("services/personas/personaService.ts");
    const create = read("services/personas/createAudienceFromProspect.ts");
    const importer = read("services/personas/personaImporter.ts");
    assert.doesNotMatch(service, /prospect_id/);
    assert.match(create, /generated_from: PROSPECT_AUDIENCE_PROVENANCE.generated_from/);
    assert.match(create, /prospect_id: prospect.id/);
    assert.match(importer, /rawJson\?: Record<string, unknown> \| null/);
    assert.match(
      create,
      /source: "generated"/,
    );
  });

  it("does not change Estimate, Deep Scrape, GetOblic, or worker contracts", () => {
    const route = read("app/api/prospects/[id]/create-audience/route.ts");
    assert.doesNotMatch(route, /estimate/i);
    assert.doesNotMatch(route, /deep-scrape/);
    assert.doesNotMatch(route, /getoblic-directory/);
    assert.doesNotMatch(route, /athenaWorker/);
    assert.doesNotMatch(
      read("services/estimate/estimateProspectContextComposer.ts"),
      /createAudienceFromProspect|prospectAudienceContextComposer/,
    );
    assert.doesNotMatch(
      read("services/personas/personaDeepScrape.ts"),
      /createAudienceFromProspect/,
    );
  });
});

describe("create audience from Prospect — orchestration", () => {
  it("rejects missing / wrong-org Prospects opaquely", async () => {
    await assert.rejects(
      () =>
        createAudienceFromProspect({
          prospectId: PROSPECT_ID,
          organizationId: OTHER_ORG,
          userId: "user-1",
          clientOrganizationId: ORG_ID,
          deps: {
            getProspectById: async (id, organizationId) => {
              assert.equal(id, PROSPECT_ID);
              assert.equal(organizationId, OTHER_ORG);
              return null;
            },
          },
        }),
      (error: unknown) =>
        error instanceof CreateAudienceFromProspectError &&
        error.code === "NOT_FOUND" &&
        error.httpStatus === 404 &&
        error.message === "Prospect not found.",
    );
  });

  it("rejects when no current Executive Version exists", async () => {
    await assert.rejects(
      () =>
        createAudienceFromProspect({
          prospectId: PROSPECT_ID,
          organizationId: ORG_ID,
          userId: "user-1",
          deps: {
            getProspectById: async () => stubProspect(),
            getCurrentExecutiveVersion: async () => null,
          },
        }),
      (error: unknown) =>
        error instanceof CreateAudienceFromProspectError &&
        error.code === "PROSPECT_INTELLIGENCE_REQUIRED" &&
        error.httpStatus === 409,
    );
  });

  it("uses session organization for Prospect, Executive Version, generation, and persist", async () => {
    const orgs: string[] = [];
    let generateOrg: string | null = null;
    let persistOrg: string | null = null;
    let persistSource: string | null = null;
    let persistRaw: Record<string, unknown> | null = null;
    let persistWebsite: string | null | undefined;
    let composedBlock: string | null = null;

    const result = await createAudienceFromProspect({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      userId: "user-1",
      clientOrganizationId: OTHER_ORG,
      deps: {
        getProspectById: async (_id, organizationId) => {
          orgs.push(organizationId);
          return stubProspect();
        },
        getCurrentExecutiveVersion: async (_discussionId, organizationId) => {
          orgs.push(organizationId);
          return currentEv;
        },
        composeContext: async (input) => {
          orgs.push(input.organizationId);
          return {
            composedText: "TRUSTED PROSPECT-DERIVED MARKET EVIDENCE\ncity: Miami",
            prospectId: PROSPECT_ID,
            businessName: "Miami Glow Medical Spa",
          };
        },
        generateCandidate: async (input) => {
          generateOrg = input.organizationId;
          composedBlock = input.prospectContextBlock ?? null;
          assert.equal(input.instruction, undefined);
          return {
            ok: true as const,
            candidate,
            requestId: "req-1",
            promptVersion: "persona_generation_v2",
            attempts: 1,
            portfolioCoverageInsight: "coverage",
          };
        },
        importPersona: async (input) => {
          persistOrg = input.organizationId;
          persistSource = input.row.source ?? null;
          persistRaw = input.rawJson ?? null;
          persistWebsite = input.row.reference_website;
          return {
            persona: { id: PERSONA_ID, organization_id: input.organizationId },
            duplicate: false,
            invalidReferenceWebsite: false,
            queued: true,
          } as never;
        },
      },
    });

    assert.deepEqual(orgs, [ORG_ID, ORG_ID, ORG_ID]);
    assert.equal(generateOrg, ORG_ID);
    assert.equal(persistOrg, ORG_ID);
    assert.equal(result.personaId, PERSONA_ID);
    assert.equal(result.duplicate, false);
    assert.equal(persistSource, "generated");
    assert.equal(persistWebsite, null);
    assert.deepEqual(persistRaw, {
      generated_from: PROSPECT_AUDIENCE_PROVENANCE.generated_from,
      prospect_id: PROSPECT_ID,
    });
    assert.match(String(composedBlock), /TRUSTED PROSPECT-DERIVED MARKET EVIDENCE/);
  });

  it("returns the existing Persona ID when the importer resolves a duplicate", async () => {
    const result = await createAudienceFromProspect({
      prospectId: PROSPECT_ID,
      organizationId: ORG_ID,
      userId: "user-1",
      deps: {
        getProspectById: async () => stubProspect(),
        getCurrentExecutiveVersion: async () => currentEv,
        composeContext: async () => ({
          composedText: "TRUSTED BLOCK",
          prospectId: PROSPECT_ID,
          businessName: "Miami Glow Medical Spa",
        }),
        generateCandidate: async () => ({
          ok: true as const,
          candidate,
          requestId: "req-dup",
          promptVersion: "persona_generation_v2",
          attempts: 1,
          portfolioCoverageInsight: "coverage",
        }),
        importPersona: async () =>
          ({
            persona: { id: "existing-persona", organization_id: ORG_ID },
            duplicate: true,
            invalidReferenceWebsite: false,
            queued: false,
          }) as never,
      },
    });

    assert.equal(result.personaId, "existing-persona");
    assert.equal(result.duplicate, true);
  });

  it("propagates Persona generation failures", async () => {
    await assert.rejects(
      () =>
        createAudienceFromProspect({
          prospectId: PROSPECT_ID,
          organizationId: ORG_ID,
          userId: "user-1",
          deps: {
            getProspectById: async () => stubProspect(),
            getCurrentExecutiveVersion: async () => currentEv,
            composeContext: async () => ({
              composedText: "TRUSTED BLOCK",
              prospectId: PROSPECT_ID,
              businessName: "Miami Glow Medical Spa",
            }),
            generateCandidate: async () => {
              throw new PersonaGenerationError({
                code: "NOVELTY_FAILED",
                message: "not distinct",
                requestId: "req-n",
                httpStatus: 422,
              });
            },
          },
        }),
      (error: unknown) =>
        error instanceof PersonaGenerationError && error.code === "NOVELTY_FAILED",
    );
  });

  it("persists provenance through existing create normalization without a public DTO", () => {
    const row = preparePersonaCreateRow({
      organization_id: ORG_ID,
      persona_name: "Growth-Focused Med Spa Owner",
      source: "generated",
      raw_json: {
        generated_from: "prospect",
        prospect_id: PROSPECT_ID,
      },
    });
    assert.equal(row.source, "generated");
    assert.equal(row.organization_id, ORG_ID);
    assert.equal(row.reference_website, null);
    assert.deepEqual(row.raw_json, {
      generated_from: "prospect",
      prospect_id: PROSPECT_ID,
    });
  });
});
