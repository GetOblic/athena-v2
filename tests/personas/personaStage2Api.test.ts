import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  preparePersonaCreateRow,
} from "../../services/personas/personaNormalization";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-2 API route contracts", () => {
  it("create route requires org context and returns durable create response", () => {
    const route = read("app/api/personas/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /importPersonaManual/);
    assert.match(route, /201/);
    assert.match(route, /personaId/);
    // Stage 3 activates enqueue; create still never exposes internal discussionId.
    assert.doesNotMatch(route, /discussionId/);
    assert.doesNotMatch(route, /enqueueDiscussionGenerationJob/);
  });

  it("get/update/delete are organization scoped and ignore protected fields", () => {
    const route = read("app/api/personas/[id]/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getPersonaById\(id, organizationId\)/);
    assert.match(route, /updatePersona/);
    assert.match(route, /deletePersona/);
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /user_id: _userId/);
    assert.match(route, /linked_discussion_id: _linkedDiscussionId/);
    assert.match(route, /404/);
    assert.doesNotMatch(route, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(route, /ensurePersonaGeneration/);
    assert.doesNotMatch(route, /regenerationQueued/);
  });

  it("lifecycle route enforces Persona allowlist only", () => {
    const route = read("app/api/personas/[id]/lifecycle/route.ts");
    assert.match(route, /isPersonaLifecycleStatus/);
    assert.match(route, /Researching/);
    assert.match(route, /In Use/);
    assert.match(route, /Archived/);
    assert.doesNotMatch(route, /Outreach Planned/);
    assert.doesNotMatch(route, /enqueueDiscussionGenerationJob/);
  });

  it("import preview remains enqueue-free; import route delegates to importer", () => {
    const preview = read("app/api/personas/import/preview/route.ts");
    const importRoute = read("app/api/personas/import/route.ts");
    assert.match(preview, /preparePersonaImportRows/);
    assert.match(importRoute, /importPersonasFromRows/);
    assert.doesNotMatch(preview, /enqueue/);
    assert.doesNotMatch(importRoute, /enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(importRoute, /createDiscussion/);
  });
});

describe("persona stage-2 manual create normalization", () => {
  it("accepts only Additional Context, Name, Notes, Ads, or valid website", () => {
    assert.doesNotThrow(() =>
      preparePersonaCreateRow({
        organization_id: "org-a",
        additional_context: "Only context",
      }),
    );
    assert.doesNotThrow(() =>
      preparePersonaCreateRow({
        organization_id: "org-a",
        persona_name: "Only name",
      }),
    );
    assert.doesNotThrow(() =>
      preparePersonaCreateRow({
        organization_id: "org-a",
        notes: "Only notes",
      }),
    );
    assert.doesNotThrow(() =>
      preparePersonaCreateRow({
        organization_id: "org-a",
        ads_content: "Only ads",
      }),
    );
    assert.doesNotThrow(() =>
      preparePersonaCreateRow({
        organization_id: "org-a",
        reference_website: "https://example.com",
      }),
    );
  });

  it("preserves invalid Reference Website and rejects blank submission", () => {
    const prepared = preparePersonaCreateRow({
      organization_id: "org-a",
      reference_website: "%%%invalid%%%",
    });
    assert.equal(prepared.reference_website, null);
    assert.equal(
      prepared.raw_json?.invalid_reference_website_input,
      "%%%invalid%%%",
    );

    assert.throws(
      () =>
        preparePersonaCreateRow({
          organization_id: "org-a",
        }),
      /at least one descriptive field/i,
    );
  });
});

describe("persona stage-2 containment — no Stage 5 surfaces", () => {
  it("does not introduce Stage 5 Persona deep-scrape or conversation surfaces", () => {
    const sidebar = read("components/dashboard/DashboardSidebar.tsx");
    assert.doesNotMatch(sidebar, /persona_intelligence/);
    assert.doesNotMatch(
      read("services/personas/personaImporter.ts"),
      /persona_deep_scrape/,
    );
  });

  it("manual import form still posts to Persona create API", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    assert.match(forms, /\/api\/personas/);
    assert.match(forms, /Create Persona/);
    assert.doesNotMatch(forms, /generationJobId/);
  });
});
