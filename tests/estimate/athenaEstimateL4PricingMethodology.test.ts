import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
} from "../../services/estimate/athenaEstimateTypes";
import {
  GOVERNED_INSTRUCTION_CONFIG_KEYS,
  TREND_SOCIAL_PROMPT_CONFIG_KEY,
  isGovernedInstructionConfigKey,
} from "../../services/superAdmin/strategicBlueprintInstructionConstants";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Athena Estimate L4 — Super Admin pricing methodology governance", () => {
  it("1. Estimate config key is exact and bounded in allowlist", () => {
    assert.equal(
      ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      "estimate_pricing_methodology",
    );
    assert.equal(ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS, 6_000);
    assert.ok(
      GOVERNED_INSTRUCTION_CONFIG_KEYS.includes(
        ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      ),
    );
    assert.ok(
      GOVERNED_INSTRUCTION_CONFIG_KEYS.includes(TREND_SOCIAL_PROMPT_CONFIG_KEY),
    );
    assert.equal(
      isGovernedInstructionConfigKey("estimate_pricing_methodology"),
      true,
    );
    assert.equal(isGovernedInstructionConfigKey("arbitrary_product_key"), false);
    assert.equal(isGovernedInstructionConfigKey("trend_social_prompt"), true);
  });

  it("2/3/4/5/6. Super Admin GET/PUT require genuine SA; marker/Licensee/Athena cannot authorize", () => {
    const route = read("app/api/super/estimate/pricing-methodology/route.ts");
    const service = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );

    assert.match(route, /export async function GET/);
    assert.match(route, /export async function PUT/);
    assert.match(
      route,
      /getEstimatePricingMethodologyInstructionForSuperAdmin/,
    );
    assert.match(
      route,
      /updateEstimatePricingMethodologyInstructionForSuperAdmin/,
    );
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /401/);
    assert.match(route, /403/);
    assert.doesNotMatch(route, /SUPER_ADMIN_MARKER_COOKIE/);
    assert.doesNotMatch(route, /LICENSEE_MASTER_MARKER/);
    assert.doesNotMatch(route, /requireLicenseeMasterAccount/);
    assert.doesNotMatch(route, /requireCurrentOrganization/);

    assert.match(service, /requireGetOblicSuperAdmin/);
    assert.match(
      service,
      /getEstimatePricingMethodologyInstructionForSuperAdmin/,
    );
    assert.match(
      service,
      /updateEstimatePricingMethodologyInstructionForSuperAdmin/,
    );
    assert.doesNotMatch(service, /SUPER_ADMIN_MARKER_COOKIE/);
    assert.doesNotMatch(service, /licensee_accounts/);
  });

  it("7/8. client cannot choose config_key or revision_id", () => {
    const route = read("app/api/super/estimate/pricing-methodology/route.ts");
    assert.match(route, /delete rest\.config_key/);
    assert.match(route, /delete rest\.configKey/);
    assert.match(route, /delete rest\.revision_id/);
    assert.match(route, /delete rest\.revisionId/);
    assert.match(route, /Never trust client config_key/);

    const service = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );
    assert.match(
      service,
      /configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY/,
    );
  });

  it("9. update creates/rotates revision using governed upsert semantics", () => {
    const generic = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    assert.match(
      generic,
      /export async function upsertGovernedInstructionForSuperAdmin/,
    );
    assert.match(generic, /revision_id: revisionId/);
    assert.match(generic, /crypto\.randomUUID\(\)/);
    assert.match(generic, /onConflict:\s*"config_key"/);

    const service = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );
    assert.match(service, /upsertGovernedInstructionForSuperAdmin/);
    assert.match(
      service,
      /configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY/,
    );
  });

  it("10/11/12. readback + never-created configured=false + whitespace semantics", () => {
    const service = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );
    assert.match(service, /toEstimatePricingMethodologyProvenance/);
    assert.match(service, /configured: instruction\.configured/);
    assert.match(
      service,
      /revisionId: instruction\.configured \? instruction\.revisionId : null/,
    );
    assert.match(
      service,
      /ESTIMATE_INSTRUCTION_NOT_CONFIGURED/,
    );
    assert.match(
      service,
      /"ESTIMATE_INSTRUCTION_NOT_CONFIGURED"/,
    );

    const generic = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    assert.match(
      generic,
      /const instructionText = String\(row\?\.instruction_text \?\? ""\)\.trim\(\)/,
    );
    assert.match(
      generic,
      /const configured = Boolean\(row && instructionText\.length > 0\)/,
    );
  });

  it("13. oversized > 6000 rejected, not truncated", () => {
    const service = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );
    const route = read("app/api/super/estimate/pricing-methodology/route.ts");
    assert.match(service, /INSTRUCTION_TOO_LONG/);
    assert.match(service, /ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS/);
    assert.doesNotMatch(service, /\.slice\(0,\s*ESTIMATE_PRICING_METHODOLOGY/);
    assert.match(route, /INSTRUCTION_TOO_LONG/);
    assert.match(route, /400/);
    assert.doesNotMatch(route, /slice\(0,/);
  });

  it("14/15. audit metadata uses existing action; full body not audited", () => {
    const audit = read("services/superAdmin/superAdminAuditLog.ts");
    const generic = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    assert.match(audit, /update_strategic_blueprint_instruction/);
    assert.match(
      generic,
      /action: "update_strategic_blueprint_instruction"/,
    );
    assert.match(generic, /config_key: input\.configKey/);
    assert.match(generic, /revision_id: row\.revision_id/);
    assert.match(generic, /instruction_char_count: instructionText\.length/);
    assert.match(generic, /configured: instruction\.configured/);
    assert.doesNotMatch(
      generic,
      /metadata:[\s\S]*instruction_text:\s*instructionText/,
    );
  });

  it("16/17/18. Super Admin UI section present, collapsed, no tenant intelligence", () => {
    const page = read("app/super/page.tsx");
    const client = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );

    assert.match(page, /initialEstimatePricingMethodologyInstruction/);
    assert.match(page, /getActiveEstimatePricingMethodologyInstruction/);
    assert.match(client, /eyebrow="Athena Estimate"/);
    assert.match(client, /Athena Estimate Pricing Methodology/);
    assert.match(client, /\/api\/super\/estimate\/pricing-methodology/);
    assert.match(client, /Save Estimate Pricing Methodology/);
    assert.match(
      client,
      /eyebrow="Athena Estimate"[\s\S]*?defaultOpen=\{false\}/,
    );
    assert.doesNotMatch(
      client,
      /eyebrow="Athena Estimate"[\s\S]*?defaultOpen=\{true\}/,
    );
    assert.doesNotMatch(client, /tenant intelligence|discussion body|brain/i);
    assert.doesNotMatch(client, /licensee_account|sub-account history/i);
  });

  it("19/20/21. Trend Social wrappers, API path, and collapsed UI preserved", () => {
    const service = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    const route = read(
      "app/api/super/strategic-blueprints/trend-social-prompt/route.ts",
    );
    const client = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );

    assert.match(
      service,
      /export async function getActiveTrendSocialPromptInstruction/,
    );
    assert.match(
      service,
      /export async function getTrendSocialPromptInstructionForSuperAdmin/,
    );
    assert.match(
      service,
      /export async function updateTrendSocialPromptInstructionForSuperAdmin/,
    );
    assert.match(service, /requireGetOblicSuperAdmin\(input\.actorUserId\)/);
    assert.match(service, /TREND_SOCIAL_PROMPT_CONFIG_KEY/);
    assert.match(service, /config_key: TREND_SOCIAL_PROMPT_CONFIG_KEY/);

    assert.match(route, /getTrendSocialPromptInstructionForSuperAdmin/);
    assert.match(route, /updateTrendSocialPromptInstructionForSuperAdmin/);
    assert.doesNotMatch(route, /estimate_pricing_methodology/);

    assert.match(client, /eyebrow="Strategic Asset Blueprints"/);
    assert.match(client, /Save Trend Social Prompt/);
    assert.match(
      client,
      /eyebrow="Strategic Asset Blueprints"[\s\S]*?defaultOpen=\{false\}/,
    );
  });

  it("23/24. L4 methodology service stays free of generation/prompt/OpenRouter; no tenant Estimate API", () => {
    // L7 owns Master UI under /licensee/estimate — L4 must not add tenant Estimate surfaces.
    assert.equal(existsSync(join(ROOT, "app/api/estimate")), false);
    assert.equal(existsSync(join(ROOT, "app/estimate")), false);

    const service = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );
    const route = read("app/api/super/estimate/pricing-methodology/route.ts");
    for (const source of [service, route]) {
      assert.doesNotMatch(source, /openrouter|OpenRouter/i);
      assert.doesNotMatch(source, /services\/ai\/prompts\/estimate/);
      assert.doesNotMatch(source, /claim_athena_estimate_generation_job/);
      assert.doesNotMatch(source, /composeEstimateOrganizationContext/);
    }

    const worker = read("workers/athenaWorker.ts");
    assert.doesNotMatch(worker, /estimate_pricing_methodology/);
    assert.doesNotMatch(worker, /claim_athena_estimate_generation_job/);
  });

  it("generic helpers reject unsupported keys; no new migration", () => {
    const generic = read(
      "services/superAdmin/strategicBlueprintInstructions.ts",
    );
    assert.match(generic, /UNSUPPORTED_CONFIG_KEY/);
    assert.match(generic, /isGovernedInstructionConfigKey/);
    assert.match(generic, /export async function getActiveGovernedInstruction/);

    assert.equal(
      existsSync(
        join(
          ROOT,
          "supabase/migrations/20260809000002_estimate_pricing_methodology.sql",
        ),
      ),
      false,
    );
    assert.equal(
      existsSync(
        join(
          ROOT,
          "supabase/migrations/20260809000001_create_athena_estimates.sql",
        ),
      ),
      true,
    );
  });
});
