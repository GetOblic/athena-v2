import "../personas/personaTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  applyPersonaLibraryConfidence,
  attachPersonaLibraryConfidence,
  collectPersonaLibraryDiscussionIds,
  extractConfidenceFromCurrentVersionRow,
  loadPersonaLibraryConfidenceByDiscussionId,
  PERSONA_LIBRARY_CONFIDENCE_SELECT,
  readPersonaLibraryConfidenceValue,
} from "../../services/personas/personaLibraryConfidence";
import { isPersonaLibraryConfidenceAvailable } from "../../lib/personas/personaLibrarySort";
import { enrichPersonasForLibrary } from "../../services/personas/personaLibraryEnrichment";
import type { Persona } from "../../services/personas/personaService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function stubPersona(
  partial: Partial<Persona> & { id: string },
): Persona {
  return {
    id: partial.id,
    created_at: partial.created_at ?? "2026-07-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-07-02T00:00:00.000Z",
    organization_id: partial.organization_id ?? "org-a",
    user_id: null,
    community_id: null,
    linked_discussion_id: partial.linked_discussion_id ?? null,
    persona_name: partial.persona_name ?? "Audience",
    short_description: partial.short_description ?? null,
    category: partial.category ?? null,
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: null,
    state: null,
    city: null,
    location_summary: null,
    languages: null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: null,
    seniority: null,
    industry_context: null,
    lifestyle: null,
    interests: null,
    digital_behavior: null,
    brands_influences: null,
    values_text: null,
    aesthetic_preferences: null,
    preferred_imagery: null,
    goals: null,
    needs: null,
    pain_points: null,
    fears: null,
    motivations: null,
    objections: null,
    buying_triggers: null,
    decision_criteria: null,
    purchase_behavior: null,
    typical_concerns: null,
    communication_style: null,
    preferred_channels: null,
    reference_website: null,
    notes: null,
    additional_context: null,
    ads_content: null,
    source: "manual",
    status: partial.status ?? "Ready",
    lifecycle_status: "New",
    opportunity_score: partial.opportunity_score ?? 88,
    priority: 1,
    profile_json: null,
    raw_json: null,
    reference_website_intelligence: null,
    last_activity: null,
    import_batch_id: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalFrom = (supabaseAdmin as any).from.bind(supabaseAdmin);

type QueryLog = {
  tables: string[];
  selects: string[];
  ins: Array<{ column: string; values: unknown }>;
};

function installVersionFixture(
  rows: Array<{ discussion_id: string; confidence?: unknown }>,
): QueryLog {
  const log: QueryLog = { tables: [], selects: [], ins: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    log.tables.push(table);
    const builder = {
      select: (columns: string) => {
        log.selects.push(columns);
        return builder;
      },
      eq: () => builder,
      in: (column: string, values: unknown) => {
        log.ins.push({ column, values });
        return builder;
      },
      then: (
        resolve?: (value: { data: typeof rows; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return builder;
  };

  return log;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("persona library confidence attach", () => {
  it("reads stored Current EV confidence and ignores opportunity_score", () => {
    assert.equal(readPersonaLibraryConfidenceValue(90), 90);
    assert.equal(readPersonaLibraryConfidenceValue(null), null);
    assert.equal(readPersonaLibraryConfidenceValue(0), 0);
    assert.equal(readPersonaLibraryConfidenceValue(undefined), null);
    assert.equal(
      extractConfidenceFromCurrentVersionRow({
        intelligence: { analysis: { confidence: 90 } },
      }),
      90,
    );
    assert.equal(
      extractConfidenceFromCurrentVersionRow({ confidence: 65 }),
      65,
    );
    assert.equal(extractConfidenceFromCurrentVersionRow({}), null);
    assert.equal(isPersonaLibraryConfidenceAvailable(90), true);
    assert.equal(isPersonaLibraryConfidenceAvailable(0), false);
    assert.equal(isPersonaLibraryConfidenceAvailable(null), false);
  });

  it("collects unique linked discussions and leaves unlinked personas null", () => {
    const personas = [
      stubPersona({ id: "p1", linked_discussion_id: "d1" }),
      stubPersona({ id: "p2", linked_discussion_id: "d1" }),
      stubPersona({ id: "p3", linked_discussion_id: null }),
    ];
    assert.deepEqual(collectPersonaLibraryDiscussionIds(personas), ["d1"]);

    const rows = applyPersonaLibraryConfidence(
      enrichPersonasForLibrary(personas),
      personas,
      new Map([["d1", 90]]),
    );
    assert.equal(rows[0].display_confidence, 90);
    assert.equal(rows[1].display_confidence, 90);
    assert.equal(rows[2].display_confidence, null);
    assert.equal(rows[0].display_opportunity_score, 88);
    assert.notEqual(rows[0].display_confidence, rows[0].display_opportunity_score);
    assert.equal("linked_discussion_id" in rows[0], false);
  });

  it("attaches ready Current EV confidence with one batched lookup", async () => {
    const personas = [
      stubPersona({ id: "p1", linked_discussion_id: "d1", status: "Ready" }),
      stubPersona({ id: "p2", linked_discussion_id: "d2", status: "Ready" }),
      stubPersona({ id: "p3", linked_discussion_id: null, status: "Queued" }),
    ];
    const log = installVersionFixture([
      { discussion_id: "d1", confidence: 90 },
      { discussion_id: "d2", confidence: 0 },
    ]);

    const rows = await attachPersonaLibraryConfidence(
      enrichPersonasForLibrary(personas),
      personas,
      "org-a",
    );

    assert.equal(log.tables.length, 1);
    assert.deepEqual(log.tables, ["athena_executive_intelligence_versions"]);
    assert.deepEqual(log.selects, [PERSONA_LIBRARY_CONFIDENCE_SELECT]);
    assert.equal(log.ins.length, 1);
    assert.equal(log.ins[0].column, "discussion_id");
    assert.deepEqual(log.ins[0].values, ["d1", "d2"]);
    assert.equal(rows[0].display_confidence, 90);
    assert.equal(rows[1].display_confidence, 0);
    assert.equal(rows[2].display_confidence, null);
    assert.equal(isPersonaLibraryConfidenceAvailable(rows[1].display_confidence), false);
  });

  it("returns null when Current EV is missing and never queries per row", async () => {
    const personas = [
      stubPersona({ id: "p1", linked_discussion_id: "d-missing" }),
    ];
    const log = installVersionFixture([]);
    const rows = await attachPersonaLibraryConfidence(
      enrichPersonasForLibrary(personas),
      personas,
      "org-a",
    );
    assert.equal(rows[0].display_confidence, null);
    assert.equal(log.tables.length, 1);

    const empty = await attachPersonaLibraryConfidence(
      enrichPersonasForLibrary([stubPersona({ id: "p0" })]),
      [stubPersona({ id: "p0" })],
      "org-a",
    );
    assert.equal(empty[0].display_confidence, null);
    assert.equal(log.tables.length, 1);
  });

  it("keeps the attach helper off the live analysis / EV resolver path", () => {
    const source = read("services/personas/personaLibraryConfidence.ts");
    assert.match(source, /athena_executive_intelligence_versions/);
    assert.match(source, /\.in\("discussion_id"/);
    assert.match(source, /is_current/);
    assert.match(source, /intelligence->analysis->confidence/);
    assert.doesNotMatch(source, /getLatestDiscussionAnalysis/);
    assert.doesNotMatch(source, /getCurrentExecutiveVersion/);
    assert.doesNotMatch(source, /opportunity_score/);
    assert.doesNotMatch(source, /IdentityKnowledgeScore|seoScorePresentation/);

    const enrichment = read("services/personas/personaLibraryEnrichment.ts");
    assert.doesNotMatch(enrichment, /athena_executive_intelligence_versions/);
    assert.doesNotMatch(enrichment, /getLatestDiscussionAnalysis/);
    assert.match(enrichment, /display_confidence: null/);
  });

  it("loads Current EV confidence for multiple personas without N+1", async () => {
    const personas = Array.from({ length: 8 }, (_, index) =>
      stubPersona({
        id: `p${index}`,
        linked_discussion_id: `d${index}`,
      }),
    );
    const log = installVersionFixture(
      personas.map((persona, index) => ({
        discussion_id: persona.linked_discussion_id as string,
        confidence: 40 + index,
      })),
    );
    const rows = await loadPersonaLibraryConfidenceByDiscussionId(
      collectPersonaLibraryDiscussionIds(personas),
      "org-a",
    );
    assert.equal(log.tables.length, 1);
    assert.equal(rows.size, 8);
    assert.equal(rows.get("d0"), 40);
    assert.equal(rows.get("d7"), 47);
  });
});
