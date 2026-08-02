import "./personaTestEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TENANT_TABLES } from "../../lib/tenantDatabase";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona tenant registry", () => {
  it("registers personas in TENANT_TABLES without removing prospects", () => {
    assert.ok(TENANT_TABLES.includes("personas"));
    assert.ok(TENANT_TABLES.includes("prospects"));
    const source = read("lib/tenantDatabase.ts");
    assert.match(source, /"personas"/);
    assert.match(source, /"prospects"/);
  });
});

describe("persona migration containment", () => {
  it("creates only the personas table and approved indexes", () => {
    const migration = read(
      "supabase/migrations/20260730000001_create_personas.sql",
    );
    assert.match(migration, /create table if not exists personas/i);
    assert.match(migration, /persona_name text/);
    assert.match(migration, /additional_context text/);
    assert.match(migration, /ads_content text/);
    assert.match(migration, /notes text/);
    assert.match(migration, /reference_website text/);
    assert.match(migration, /profile_json jsonb/);
    assert.match(migration, /raw_json jsonb/);
    assert.match(migration, /reference_website_intelligence jsonb/);
    assert.match(migration, /last_deep_scrape_at timestamptz/);
    assert.match(migration, /last_deep_scrape_pages integer/);
    assert.match(migration, /personas_organization_id_idx/);
    assert.match(migration, /personas_organization_created_idx/);
    assert.match(migration, /personas_organization_status_idx/);
    assert.match(migration, /personas_linked_discussion_id_idx/);
    assert.match(migration, /personas_import_batch_id_idx/);
    assert.match(migration, /personas_org_reference_website_unique/);
    assert.match(migration, /personas_org_label_city_unique/);
    assert.match(
      migration,
      /where reference_website is null[\s\S]*persona_name is not null/i,
    );
    assert.doesNotMatch(migration, /alter table prospects/i);
    assert.doesNotMatch(migration, /persona_deep_scrape/);
    assert.doesNotMatch(migration, /athena_website_deep_scrape_jobs/);
    assert.doesNotMatch(migration, /athena_asset_interactions/);
    assert.doesNotMatch(migration, /enable row level security/i);
    assert.doesNotMatch(migration, /create type /i);
  });
});

describe("persona service tenant containment contracts", () => {
  it("scopes get/list/update/delete by organization_id", () => {
    const service = read("services/personas/personaService.ts");
    assert.match(service, /export async function getPersonas/);
    assert.match(service, /export async function getPersonaById/);
    assert.match(service, /export async function createPersona/);
    assert.match(service, /export async function updatePersona/);
    assert.match(service, /export async function deletePersona/);

    assert.match(
      service,
      /from\("personas"\)[\s\S]*\.eq\("organization_id", organizationId\)/,
    );
    assert.match(
      service,
      /\.eq\("id", id\)[\s\S]*\.eq\("organization_id", organizationId\)/,
    );

    const getByIdBlock = service.slice(
      service.indexOf("export async function getPersonaById"),
      service.indexOf("export async function createPersona"),
    );
    assert.match(getByIdBlock, /\.eq\("organization_id", organizationId\)/);

    const updateBlock = service.slice(
      service.indexOf("export async function updatePersona"),
      service.indexOf("export async function deletePersona"),
    );
    assert.match(updateBlock, /getPersonaById\(id, organizationId\)/);
    assert.match(updateBlock, /\.eq\("id", id\)/);
    assert.match(updateBlock, /\.eq\("organization_id", organizationId\)/);

    const deleteBlock = service.slice(
      service.indexOf("export async function deletePersona"),
    );
    assert.match(deleteBlock, /getPersonaById\(id, organizationId\)/);
    assert.match(deleteBlock, /\.eq\("id", id\)/);
    assert.match(deleteBlock, /\.eq\("organization_id", organizationId\)/);
    assert.match(deleteBlock, /linked_discussion_id/);
    assert.match(deleteBlock, /bridgeDiscussionId/);
    assert.match(deleteBlock, /deleteDiscussion/);
    assert.match(deleteBlock, /getDiscussionById/);
    assert.match(deleteBlock, /stillPresent/);
    const personaDeleteIndex = deleteBlock.indexOf('.from("personas")');
    const discussionDeleteIndex = deleteBlock.indexOf("await deleteDiscussion");
    assert.ok(personaDeleteIndex >= 0);
    assert.ok(discussionDeleteIndex >= 0);
    assert.ok(
      discussionDeleteIndex < personaDeleteIndex,
      "bridge cleanup must run before Persona row delete",
    );
  });

  it("update allowlist excludes protected ownership identifiers", () => {
    const normalization = read("services/personas/personaNormalization.ts");
    assert.match(
      normalization,
      /Omit<[\s\S]*"organization_id"\s*\|\s*"user_id"\s*\|\s*"import_batch_id"\s*\|\s*"source"/,
    );
    const service = read("services/personas/personaService.ts");
    assert.doesNotMatch(service, /payload\.organization_id\s*=/);
    assert.doesNotMatch(service, /payload\.id\s*=/);
    assert.doesNotMatch(service, /payload\.user_id\s*=/);
    assert.doesNotMatch(service, /payload\.created_at\s*=/);
  });

  it("create uses preparePersonaCreateRow and does not enqueue generation", () => {
    const service = read("services/personas/personaService.ts");
    assert.match(service, /preparePersonaCreateRow\(input\)/);
    assert.doesNotMatch(service, /enqueueDiscussionGenerationJob/);
    assert.doesNotMatch(service, /ensurePersonaGenerationQueued/);
    assert.doesNotMatch(service, /persona_intelligence/);
  });
});

describe("persona stage-1 foundation — Prospect isolation preserved", () => {
  it("does not modify Prospect service or public DTO for Personas", () => {
    const prospectService = read("services/prospects/prospectService.ts");
    assert.doesNotMatch(prospectService, /persona/i);

    const prospectPublic = read("services/prospects/prospectPublic.ts");
    assert.doesNotMatch(prospectPublic, /persona/i);
  });
});
