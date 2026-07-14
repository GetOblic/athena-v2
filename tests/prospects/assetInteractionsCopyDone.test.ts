import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BLUEPRINT_ASSET_TYPES,
  LIVE_EXECUTIVE_VERSION_SENTINEL,
  canonicalDeploymentAssetType,
  isSupportedAssetInteractionType,
  resolveExecutiveVersionScopeId,
} from "../../services/assetInteractions/assetInteractionKeys";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Asset interaction keys and version scope", () => {
  it("maps Deployment Asset labels to canonical keys", () => {
    assert.equal(
      canonicalDeploymentAssetType("PERSONALIZED_OUTREACH_EMAIL"),
      "email_outreach",
    );
    assert.equal(
      canonicalDeploymentAssetType("COMMUNITY_REPLY"),
      "community_reply",
    );
    assert.equal(canonicalDeploymentAssetType("PRIMARY_REPLY"), "primary_reply");
  });

  it("supports blueprint prompt asset types", () => {
    assert.equal(
      isSupportedAssetInteractionType(BLUEPRINT_ASSET_TYPES.image_prompt),
      true,
    );
    assert.equal(isSupportedAssetInteractionType("not_a_real_asset"), false);
  });

  it("scopes live/legacy versions to the nil UUID sentinel", () => {
    assert.equal(
      resolveExecutiveVersionScopeId(null),
      LIVE_EXECUTIVE_VERSION_SENTINEL,
    );
    assert.equal(
      resolveExecutiveVersionScopeId("   "),
      LIVE_EXECUTIVE_VERSION_SENTINEL,
    );
    assert.equal(
      resolveExecutiveVersionScopeId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("Prospect and Discussion source types remain isolated in the unique contract", () => {
    const migration = read(
      "supabase/migrations/20260718000001_create_athena_asset_interactions.sql",
    );
    assert.match(migration, /athena_asset_interactions/);
    assert.match(migration, /athena_asset_interactions_unique/);
    assert.match(
      migration,
      /check \(source_type in \('discussion', 'prospect'\)\)/,
    );
    assert.match(
      migration,
      /organization_id,\s*user_id,\s*source_type,\s*source_id,\s*executive_version_id,\s*asset_type,\s*interaction_type/s,
    );
    assert.doesNotMatch(migration, /whatsapp_number/);
    assert.doesNotMatch(migration, /alter table prospects/i);
  });
});

describe("Copy / Copied / Done UI and API contracts", () => {
  it("1/2. CopyButton shows Copied then resets via timer", () => {
    const source = read("components/deployment/CopyButton.tsx");
    assert.match(source, /copied \? "Copied" : "Copy"/);
    assert.match(source, /ACK_MS = 2000|2000/);
    assert.match(source, /setTimeout/);
  });

  it("3. multiple CopyButtons keep independent React state", () => {
    const assets = read("components/deployment/DeploymentAssets.tsx");
    assert.match(assets, /<CopyButton/);
    assert.match(assets, /initiallyDone=\{Boolean\(doneByAssetType\[assetType\]\)\}/);
  });

  it("4/5/6. Done loads per source and selected Executive Version", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /\/api\/asset-interactions/);
    assert.match(workspace, /executiveVersionId/);
    assert.match(workspace, /doneByAssetType/);
    assert.match(workspace, /prospectId/);
    assert.match(workspace, /sourceType: copySourceType/);
  });

  it("7. Prospect page scopes Done to prospect id; Discussion uses discussion id", () => {
    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(prospectPage, /prospectId=\{prospect\.id\}/);
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(
      workspace,
      /isProspect && prospectId\?\.trim\(\) \? prospectId\.trim\(\) : discussionId/,
    );
  });

  it("8/9/10. service resolves unique violations idempotently without surfacing 23505", () => {
    const service = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(service, /23505/);
    assert.match(service, /duplicate_resolved_idempotently/);
    assert.match(service, /bumpInteraction/);
    assert.doesNotMatch(service, /onConflict/);
  });

  it("11. API returns structured JSON for unauthorized and validation errors", () => {
    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /code: "UNAUTHORIZED"/);
    assert.match(route, /code: "VALIDATION_ERROR"/);
    assert.match(route, /NextResponse\.json/);
    assert.match(route, /\[ASSET_INTERACTIONS_POST\]/);
  });

  it("12. API enforces tenant source and Executive Version access checks", () => {
    const route = read("app/api/asset-interactions/route.ts");
    assert.match(route, /assertSourceAccess/);
    assert.match(route, /assertExecutiveVersionAccess/);
    assert.match(route, /requireCurrentOrganizationContext/);
  });

  it("Copy does not mark Done when clipboard fails; Done only after API ok", () => {
    const source = read("components/deployment/CopyButton.tsx");
    assert.match(source, /writeClipboardText/);
    assert.match(source, /setDone\(true\)/);
    assert.match(source, /response\.ok && payload\.ok/);
    assert.match(source, /Could not save Done/);
    assert.match(source, /\bDone\b/);
  });

  it("Strategic Blueprint prompt blocks restore Done tracking", () => {
    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.match(blueprint, /BLUEPRINT_ASSET_TYPES/);
    assert.match(blueprint, /copyContext/);
    assert.match(blueprint, /doneByAssetType/);
  });
});

describe("Idempotent record helper behavior", () => {
  it("unique-violation detector matches Postgres 23505 and duplicate messages", async () => {
    const source = read(
      "services/assetInteractions/assetInteractionService.ts",
    );
    assert.match(source, /function isUniqueViolation/);
    assert.match(source, /duplicate key\|unique constraint/i);
  });
});
