import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BLUEPRINT_ASSET_TYPES } from "../../services/assetInteractions/assetInteractionKeys";
import {
  ASSET_BLUEPRINT_OUTPUT_SCHEMA,
  getAssetBlueprintOutputSchemaForDebug,
} from "../../services/assetBlueprints/prompts/assetBlueprintPrompt";
import {
  normalizeStrategicBlueprintArtifact,
  validateStrategicBlueprintArtifact,
} from "../../services/assetBlueprints/strategicBlueprintArtifactContract";
import {
  appendTrendSocialPromptInstructionBlock,
  applyTrendSocialPromptMissingConfigGuard,
} from "../../services/assetBlueprints/trendSocialPromptInjection";
import {
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
} from "../../services/superAdmin/strategicBlueprintInstructionConstants";

type ActiveStrategicBlueprintInstruction = {
  key: typeof TREND_SOCIAL_PROMPT_CONFIG_KEY;
  configured: boolean;
  instructionText: string;
  revisionId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

function toTrendSocialPromptConfigProvenance(
  instruction: ActiveStrategicBlueprintInstruction,
) {
  return {
    key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
    revision_id: instruction.configured ? instruction.revisionId : null,
    configured: instruction.configured,
  };
}

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function pathExists(relativePath: string): boolean {
  try {
    readFileSync(join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

const configuredInstruction: ActiveStrategicBlueprintInstruction = {
  key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
  configured: true,
  instructionText: "Use short-form vertical video hooks with native CTAs.",
  revisionId: "11111111-1111-1111-1111-111111111111",
  updatedAt: "2026-08-08T00:00:00.000Z",
  updatedBy: "actor-1",
};

const missingInstruction: ActiveStrategicBlueprintInstruction = {
  key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
  configured: false,
  instructionText: "",
  revisionId: null,
  updatedAt: null,
  updatedBy: null,
};

describe("V25 — Trend Social Prompt", () => {
  it("1-4. Super Admin authority required; marker cookie alone cannot authorize", () => {
    const route = read(
      "app/api/super/strategic-blueprints/trend-social-prompt/route.ts",
    );
    const service = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    const marker = read("services/superAdmin/superAdminMarkerCookie.ts");

    assert.match(route, /requireGetOblicSuperAdmin|getTrendSocialPromptInstructionForSuperAdmin|updateTrendSocialPromptInstructionForSuperAdmin/);
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(route, /export async function GET/);
    assert.match(route, /export async function PUT/);
    assert.match(service, /requireGetOblicSuperAdmin/);
    assert.match(
      service,
      /getTrendSocialPromptInstructionForSuperAdmin/,
    );
    assert.match(
      service,
      /updateTrendSocialPromptInstructionForSuperAdmin/,
    );
    assert.doesNotMatch(route, /SUPER_ADMIN_MARKER_COOKIE/);
    assert.doesNotMatch(service, /SUPER_ADMIN_MARKER_COOKIE/);
    assert.match(marker, /non-authoritative|UX-only|must not authorize/i);
  });

  it("3-4. Ordinary Athena users and Licensee Masters cannot mutate configuration", () => {
    const service = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    const updateFn = service.slice(
      service.indexOf(
        "export async function updateTrendSocialPromptInstructionForSuperAdmin",
      ),
    );

    assert.match(updateFn, /requireGetOblicSuperAdmin\(input\.actorUserId\)/);
    assert.doesNotMatch(updateFn, /licensee_accounts/);
    assert.doesNotMatch(updateFn, /organization_members/);
    assert.doesNotMatch(updateFn, /requireCurrentOrganization/);
  });

  it("5-6. Configuration persistence and revision provenance", () => {
    const migration = read(
      "supabase/migrations/20260808000002_create_strategic_blueprint_instructions.sql",
    );
    const service = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );

    assert.match(
      migration,
      /create table if not exists getoblic_strategic_blueprint_instructions/,
    );
    assert.match(migration, /config_key text not null unique/);
    assert.match(migration, /instruction_text text not null/);
    assert.match(migration, /revision_id uuid not null/);
    assert.match(migration, /updated_by uuid null/);
    assert.match(migration, /updated_at timestamptz not null/);
    assert.match(service, /TREND_SOCIAL_PROMPT_CONFIG_KEY/);
    assert.match(service, /revision_id: revisionId/);
    assert.match(service, /onConflict:\s*"config_key"/);
    assert.match(service, /crypto\.randomUUID\(\)/);
  });

  it("7-8. Blueprint contract includes trend_social_prompt; social_prompt preserved separately", () => {
    assert.match(ASSET_BLUEPRINT_OUTPUT_SCHEMA, /"social_prompt"/);
    assert.match(ASSET_BLUEPRINT_OUTPUT_SCHEMA, /"trend_social_prompt"/);
    assert.notEqual(
      ASSET_BLUEPRINT_OUTPUT_SCHEMA.indexOf("social_prompt"),
      ASSET_BLUEPRINT_OUTPUT_SCHEMA.indexOf("trend_social_prompt"),
    );

    const instructions = getAssetBlueprintOutputSchemaForDebug();
    assert.match(instructions, /social_prompt/);
    assert.match(instructions, /trend_social_prompt/);
    assert.match(
      instructions,
      /ADDITIONAL to social_prompt|Never replace, rename, omit, or reinterpret social_prompt/,
    );

    const artifact = normalizeStrategicBlueprintArtifact({
      asset_title: "Title",
      asset_type: "pdf_guide",
      business_goal: "Goal",
      target_audience: "Audience",
      priority: "high",
      estimated_reuse: 3,
      image_prompt: "image",
      pdf_prompt: "pdf",
      social_prompt: "Recommended platform: LinkedIn\n\nStrategic rationale:\nWhy\n\nPlatform-native prompt:\nBody",
      trend_social_prompt: "Trend body",
      notes: "Notes",
    });
    assert.equal(typeof artifact.social_prompt, "string");
    assert.equal(typeof artifact.trend_social_prompt, "string");
    assert.equal(artifact.social_prompt.includes("Recommended platform"), true);
    assert.equal(artifact.trend_social_prompt, "Trend body");

    const validation = validateStrategicBlueprintArtifact(artifact);
    assert.equal(validation.valid, true);
  });

  it("9. Current instruction is injected during new generation", () => {
    const service = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    const injection = read(
      "services/assetBlueprints/trendSocialPromptInjection.ts",
    );

    assert.match(service, /getActiveTrendSocialPromptInstruction/);
    assert.match(service, /withTrendSocialPromptInstruction/);
    assert.match(service, /appendTrendSocialPromptInstructionBlock/);
    assert.match(
      injection,
      /BEGIN_GETOBLIC_TREND_SOCIAL_PROMPT_INSTRUCTION/,
    );
    assert.match(
      injection,
      /END_GETOBLIC_TREND_SOCIAL_PROMPT_INSTRUCTION/,
    );

    const prompt = appendTrendSocialPromptInstructionBlock(
      "BASE PROMPT",
      configuredInstruction,
    );
    assert.match(prompt, /BASE PROMPT/);
    assert.match(prompt, /Use short-form vertical video hooks/);
    assert.match(prompt, /revision_id: 11111111-1111-1111-1111-111111111111/);
    assert.match(prompt, /ADDITIONAL to social_prompt/);
  });

  it("10-12. Discussion / Prospect / Persona share Strategic Asset Blueprint architecture", () => {
    const service = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    const ui = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    const prospectResolve = read(
      "services/prospectConversation/prospectConversationAssetResolve.ts",
    );
    const personaResolve = read(
      "services/personaConversation/personaConversationAssetResolve.ts",
    );

    assert.match(service, /createAssetBlueprintForBriefing/);
    assert.match(service, /createAssetBlueprintForDiscussionAnalysis/);
    assert.match(service, /trend_social_prompt/);
    assert.match(ui, /label="Trend Social Prompt"/);
    assert.match(ui, /blueprint\.trend_social_prompt/);
    assert.match(prospectResolve, /trend_social_prompt/);
    assert.match(personaResolve, /trend_social_prompt/);
    assert.match(prospectResolve, /Trend Social Prompt/);
    assert.match(personaResolve, /Trend Social Prompt/);
  });

  it("13-16. Persistence, render-from-stored, immutability, provenance", () => {
    const service = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    const ui = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    const migration = read(
      "supabase/migrations/20260808000002_create_strategic_blueprint_instructions.sql",
    );

    assert.match(service, /trend_social_prompt: input\.parsed\.trend_social_prompt/);
    assert.match(service, /trend_social_prompt_config:/);
    assert.match(service, /toTrendSocialPromptConfigProvenance/);
    assert.match(ui, /text=\{blueprint\.trend_social_prompt\}/);
    assert.doesNotMatch(ui, /getActiveTrendSocialPromptInstruction/);
    assert.match(
      migration,
      /add column if not exists trend_social_prompt text/,
    );
    assert.match(
      migration,
      /not reconstructed from live Super Admin config/i,
    );

    const provenance = toTrendSocialPromptConfigProvenance(configuredInstruction);
    assert.deepEqual(provenance, {
      key: "trend_social_prompt",
      revision_id: "11111111-1111-1111-1111-111111111111",
      configured: true,
    });

    const missingProvenance =
      toTrendSocialPromptConfigProvenance(missingInstruction);
    assert.deepEqual(missingProvenance, {
      key: "trend_social_prompt",
      revision_id: null,
      configured: false,
    });
  });

  it("17. Super Admin configuration UI exposes Trend Social Prompt management", () => {
    const page = read("app/super/page.tsx");
    const client = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );

    assert.match(page, /initialTrendSocialPromptInstruction/);
    assert.match(page, /getActiveTrendSocialPromptInstruction/);
    assert.match(client, /Strategic Asset Blueprints/);
    assert.match(client, /Trend Social Prompt/);
    assert.match(
      client,
      /\/api\/super\/strategic-blueprints\/trend-social-prompt/,
    );
    assert.match(client, /Save Trend Social Prompt/);
    assert.doesNotMatch(client, /tenant intelligence|discussion body/i);
  });

  it("17b. Strategic Asset Blueprints Super Admin card is collapsed by default", () => {
    const client = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );
    assert.match(client, /AthenaCollapsibleSection/);
    assert.match(
      client,
      /eyebrow="Strategic Asset Blueprints"[\s\S]*?defaultOpen=\{false\}/,
    );
    assert.doesNotMatch(
      client,
      /eyebrow="Strategic Asset Blueprints"[\s\S]*?defaultOpen=\{true\}/,
    );
  });

  it("missing-configuration behavior is deterministic and non-hallucinating", () => {
    const prompt = appendTrendSocialPromptInstructionBlock(
      "BASE",
      missingInstruction,
    );
    assert.match(prompt, /CONFIGURATION ABSENT|ABSENT \/ EMPTY/);
    assert.match(prompt, /Do NOT invent/);
    assert.ok(prompt.includes(TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT));

    const parsed = {
      trend_social_prompt: "hallucinated trend policy",
    };
    applyTrendSocialPromptMissingConfigGuard(parsed, missingInstruction);
    assert.equal(
      parsed.trend_social_prompt,
      TREND_SOCIAL_PROMPT_UNAVAILABLE_OUTPUT,
    );
  });

  it("interaction key is distinct and supported", () => {
    assert.equal(
      BLUEPRINT_ASSET_TYPES.trend_social_prompt,
      "blueprint_trend_social_prompt",
    );
    assert.notEqual(
      BLUEPRINT_ASSET_TYPES.trend_social_prompt,
      BLUEPRINT_ASSET_TYPES.social_prompt,
    );
    const keys = read(
      "services/assetInteractions/assetInteractionKeys.ts",
    );
    assert.match(keys, /trend_social_prompt:\s*"blueprint_trend_social_prompt"/);
  });

  it("audit action extends existing Super Admin audit mechanism", () => {
    const audit = read("services/superAdmin/superAdminAuditLog.ts");
    const service = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    assert.match(audit, /update_strategic_blueprint_instruction/);
    assert.match(service, /update_strategic_blueprint_instruction/);
    assert.match(service, /config_key: TREND_SOCIAL_PROMPT_CONFIG_KEY/);
    assert.match(service, /revision_id: row\.revision_id/);
    assert.match(service, /instruction_char_count:/);
    // Durable audit metadata must not embed the full prompt body.
    const successAudit = service.slice(
      service.lastIndexOf("await logSuperAdminAudit({"),
    );
    assert.doesNotMatch(
      successAudit.slice(0, 400),
      /instruction_text:\s*instructionText|instructionText:\s*instructionText/,
    );
  });

  it("database security follows V24 control-plane lockdown", () => {
    const migration = read(
      "supabase/migrations/20260808000002_create_strategic_blueprint_instructions.sql",
    );
    assert.match(
      migration,
      /alter table getoblic_strategic_blueprint_instructions enable row level security/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_strategic_blueprint_instructions from public/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_strategic_blueprint_instructions from anon/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_strategic_blueprint_instructions from authenticated/,
    );
    assert.match(
      migration,
      /grant all on table getoblic_strategic_blueprint_instructions to service_role/,
    );
    assert.doesNotMatch(migration, /create policy/i);
  });

  it("migration file exists and is not applied by this suite", () => {
    assert.equal(
      pathExists(
        "supabase/migrations/20260808000002_create_strategic_blueprint_instructions.sql",
      ),
      true,
    );
  });

  it("brain contract and parse aliases include trend_social_prompt", () => {
    const helpers = read(
      "services/brain/generationContracts/contractHelpers.ts",
    );
    const parse = read(
      "services/assetBlueprints/safeParseStrategicBlueprintResponse.ts",
    );
    assert.match(helpers, /"trend_social_prompt"/);
    assert.match(
      helpers,
      /Do not replace or reinterpret social_prompt as trend_social_prompt/,
    );
    assert.match(parse, /trendSocialPrompt:\s*"trend_social_prompt"/);
    assert.match(parse, /"trend_social_prompt"/);
  });
});
