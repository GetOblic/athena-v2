import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";
import {
  formatPersonaLocation,
  formatPersonaOpportunityScore,
  resolvePersonaDisplayReadiness,
} from "../../services/personas/personaDisplay";
import { enrichPersonasForLibrary } from "../../services/personas/personaLibraryEnrichment";
import { resolvePersonaDisplayLabel } from "../../services/personas/personaUtils";
import type { Persona } from "../../services/personas/personaService";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function stubPersona(partial: Partial<Persona> & { id: string }): Persona {
  return {
    id: partial.id,
    created_at: partial.created_at ?? "2026-07-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-07-02T00:00:00.000Z",
    organization_id: partial.organization_id ?? "org-a",
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    persona_name: partial.persona_name ?? null,
    short_description: partial.short_description ?? null,
    category: partial.category ?? null,
    gender_identity: null,
    age_range: null,
    birth_year_approx: null,
    generation: null,
    cultural_background: null,
    country: partial.country ?? null,
    state: partial.state ?? null,
    city: partial.city ?? null,
    location_summary: partial.location_summary ?? null,
    languages: partial.languages ?? null,
    relationship_status: null,
    household: null,
    income_range: null,
    purchasing_power: null,
    education: null,
    occupation: partial.occupation ?? null,
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
    reference_website: partial.reference_website ?? null,
    notes: partial.notes ?? null,
    additional_context: partial.additional_context ?? null,
    ads_content: partial.ads_content ?? null,
    source: partial.source ?? "manual",
    status: partial.status ?? "Queued",
    lifecycle_status: partial.lifecycle_status ?? "New",
    opportunity_score: partial.opportunity_score ?? null,
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

describe("persona stage-2 navigation", () => {
  it("adds Personas once beside Prospects without reordering unrelated items", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    const hrefs = dashboardNavItems.map((item) => item.href);

    assert.equal(labels.filter((label) => label === "Personas").length, 1);
    assert.equal(hrefs.includes("/personas"), true);

    const prospectIndex = labels.indexOf("Prospects");
    const personaIndex = labels.indexOf("Personas");
    assert.equal(labels[prospectIndex], "Prospects");
    assert.equal(hrefs[prospectIndex], "/prospects");
    assert.equal(personaIndex, prospectIndex + 1);

    assert.deepEqual(labels.slice(0, prospectIndex), [
      "Dashboard",
      "Getting Started",
      "Athena Brain",
      "Intelligence Domains",
      "Inbox",
      "Discussions",
    ]);
    assert.deepEqual(labels.slice(personaIndex + 1), [
      "Ads",
      "SEO Intelligence",
      "Social Planner",
      "Opportunities",
      "Briefings",
    ]);
  });
});

describe("persona stage-2 display helpers", () => {
  it("maps stored Queued readiness to Profile Created without changing stored status", () => {
    assert.equal(resolvePersonaDisplayReadiness("Queued"), "Profile Created");
    // Stage 4: Ready is the publication-complete display claim.
    assert.equal(resolvePersonaDisplayReadiness("Ready"), "Ready");
    assert.equal(
      resolvePersonaDisplayReadiness("Processing Failed"),
      "Processing Failed",
    );
  });

  it("formats location without empty separators", () => {
    assert.equal(
      formatPersonaLocation({
        city: "Chicago",
        state: "",
        country: "United States",
      }),
      "Chicago, United States",
    );
    assert.equal(
      formatPersonaLocation({
        city: null,
        state: null,
        country: null,
        location_summary: "Bay Area",
      }),
      "Bay Area",
    );
  });

  it("handles null opportunity score deterministically", () => {
    assert.equal(formatPersonaOpportunityScore(null), "—");
    assert.equal(formatPersonaOpportunityScore(0), "—");
    assert.equal(formatPersonaOpportunityScore(72), "72");
  });

  it("enriches library rows with display label and Stage 2 readiness", () => {
    const rows = enrichPersonasForLibrary([
      stubPersona({
        id: "p1",
        additional_context: "Context-only audience notes",
        status: "Queued",
        opportunity_score: null,
      }),
    ]);

    assert.equal(
      rows[0].display_label,
      resolvePersonaDisplayLabel({
        additional_context: "Context-only audience notes",
      }),
    );
    assert.equal(rows[0].display_status, "Profile Created");
    assert.equal(rows[0].display_opportunity_score_label, "—");
    assert.equal("linked_discussion_id" in rows[0], false);
  });
});

describe("persona stage-2 library UX contracts", () => {
  it("uses 25-row pagination and required columns", () => {
    const client = read("components/personas/PersonasLibraryClient.tsx");
    assert.match(client, /const PAGE_SIZE = 25/);
    assert.match(client, /display_label/);
    assert.match(client, /display_reference_website/);
    assert.doesNotMatch(client, /Opportunity Score/);
    assert.match(client, /Create audience|createCta/);
    assert.match(client, /Unable to load audiences/);
    assert.doesNotMatch(client, /display_opportunity_score == null/);
  });

  it("library page surfaces load errors instead of silent empty state", () => {
    const page = read("app/personas/page.tsx");
    assert.match(page, /loadError/);
    assert.match(page, /getPersonas\(organizationId\)/);
    assert.match(page, /enrichPersonasForLibrary/);
    assert.doesNotMatch(page, /from\("personas"\)/);
  });
});

describe("persona stage-2 detail and metadata contracts", () => {
  it("detail page keeps metadata editing alongside later-stage actions", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaMetadataEditor/);
    assert.match(page, /PersonaLifecycleStatusControl/);
  });

  it("metadata editor updates without regeneration hooks", () => {
    const editor = read("components/personas/PersonaMetadataEditor.tsx");
    assert.match(editor, /\/api\/personas\/\$\{persona\.id\}/);
    assert.match(editor, /method: "PATCH"/);
    assert.doesNotMatch(editor, /method: "DELETE"/);
    assert.doesNotMatch(editor, /Confirm Delete/);
    assert.doesNotMatch(editor, /regenerationQueued/);
    assert.doesNotMatch(editor, /ensurePersonaGeneration/);
    assert.doesNotMatch(editor, /trackQueuedGeneration/);
    assert.match(editor, /additional_context/);
    assert.match(editor, /notes/);
    assert.match(editor, /ads_content/);

    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaHeaderDeleteButton/);
    const headerDelete = read(
      "components/personas/PersonaHeaderDeleteButton.tsx",
    );
    assert.match(headerDelete, /ConfirmDeleteControl/);
    assert.match(headerDelete, /\/api\/personas\/\$\{personaId\}/);
    assert.match(headerDelete, /redirectTo="\/personas"/);
  });
});

describe("persona stage-2 route surface", () => {
  it("keeps Stage 2 CRUD/import routes and excludes Prospect analyze route", () => {
    assert.equal(existsSync(join(ROOT, "app/personas/page.tsx")), true);
    assert.equal(existsSync(join(ROOT, "app/personas/import/page.tsx")), true);
    assert.equal(existsSync(join(ROOT, "app/personas/[id]/page.tsx")), true);
    assert.equal(existsSync(join(ROOT, "app/api/personas/route.ts")), true);
    assert.equal(existsSync(join(ROOT, "app/api/personas/[id]/route.ts")), true);
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/lifecycle/route.ts")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/import/route.ts")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/import/preview/route.ts")),
      true,
    );

    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/analyze")),
      false,
    );
  });
});
