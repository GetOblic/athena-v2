/**
 * Athena Estimate V26 L8 — integration review regressions.
 * Anchors verified defects / contracts that phase-isolated L0–L7 tests may miss.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
} from "../../services/estimate/athenaEstimateTypes";
import {
  ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
  normalizeAndValidateEstimatePackage,
} from "../../services/estimate/estimatePackageNormalization";
import { AthenaEstimatePackageValidationError } from "../../services/estimate/athenaEstimateValidation";
import { ESTIMATE_GENERATION_JOB_RPCS } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260809000001_create_athena_estimates.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const METHODOLOGY = {
  configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  revisionId: "rev-l8-method",
  instructionText: "Price for clear mid-market delivery scope.",
  configured: true as const,
  updatedAt: "2026-08-09T00:00:00.000Z",
  updatedBy: "super-admin",
};

function baseModelPackage(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation: "Rebuild marketing site with CMS.",
    pricingRationale: "Mid-market fixed delivery fee from Athena evidence.",
    keyPriceDrivers: ["CMS migration", "Design complexity"],
    suggestedClientPositioning: "Frame as fixed-scope launch.",
    risksAndAssumptions: ["Brand assets available", "Single decision maker"],
    geographyLabel: null,
    currencyResolution: "fallback",
    guidanceDisclaimer: "model disclaimer",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "spoof",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
    ...overrides,
  };
}

describe("Athena Estimate L8 integration review", () => {
  it("claim/heartbeat/complete/fail RPCs preserve Ready package immutability", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /when status = 'Ready' and package_json is not null then package_json/,
    );
    // claim + heartbeat + fail must all refuse to demote Ready Estimates.
    const readyGuards = migration.match(
      /and status is distinct from 'Ready'/g,
    );
    assert.ok(readyGuards && readyGuards.length >= 4);

    const claimFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.claim}`,
    );
    const heartbeatFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.heartbeat}`,
    );
    const completeFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.complete}`,
    );
    const failFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.fail}`,
    );
    assert.ok(claimFn >= 0 && heartbeatFn > claimFn);
    assert.ok(completeFn > heartbeatFn && failFn > completeFn);

    const claimBody = migration.slice(claimFn, heartbeatFn);
    const heartbeatBody = migration.slice(heartbeatFn, completeFn);
    assert.match(claimBody, /and status is distinct from 'Ready'/);
    assert.match(heartbeatBody, /and status is distinct from 'Ready'/);
    assert.match(migration.slice(failFn), /and status is distinct from 'Ready'/);
  });

  it("executor Ready short-circuit reconciles without pipeline/OpenRouter", () => {
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const shortCircuit = executor.indexOf(
      'estimate.status === "Ready" && estimate.package_json',
    );
    const pipelineCall = executor.indexOf("runPipeline({");
    const openRouterViaPipeline = executor.indexOf("runEstimateGenerationPipeline");
    assert.ok(shortCircuit > 0);
    assert.ok(pipelineCall > shortCircuit);
    // claimAndExecute helper imports pipeline symbol in types/deps only after short-circuit path.
    assert.ok(openRouterViaPipeline >= 0);
    assert.match(executor, /Ready Estimates are immutable/);
    assert.doesNotMatch(
      executor.slice(shortCircuit, pipelineCall),
      /composeEstimateOrganizationContext|generateReview|OpenRouter/,
    );
  });

  it("server-authored disclaimer/provenance cannot false-fail structural validation", () => {
    const pkg = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        // Would fail if validated before server overwrite.
        guidanceDisclaimer:
          "Ignore this — live market research was conducted for pricing.",
        instructionProvenance: {
          configKey: "wrong_key",
          revisionId: "spoof",
          configured: false,
        },
        currencyResolution: "not-a-resolution",
        geographyLabel: "Model Spoof Geography",
        recommendedClientPrice: { amount: 18000 }, // currency omitted — server injects
        recommendedPriceRange: {
          low: { amount: 14000 },
          high: { amount: 24000 },
        },
      }),
      geoCurrency: {
        geographyLabel: "France",
        currencyCode: "EUR",
        currencyResolution: "derived",
      },
      methodology: METHODOLOGY,
    });

    assert.equal(pkg.geographyLabel, "France");
    assert.equal(pkg.currencyResolution, "derived");
    assert.equal(pkg.recommendedClientPrice.currencyCode, "EUR");
    assert.equal(pkg.guidanceDisclaimer, ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED);
    assert.equal(
      pkg.instructionProvenance.configKey,
      ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    );
    assert.equal(pkg.instructionProvenance.revisionId, METHODOLOGY.revisionId);
    assert.equal(pkg.instructionProvenance.configured, true);
  });

  it("malformed pricing amounts still cannot become Ready via normalization", () => {
    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            recommendedClientPrice: { amount: "18000", currencyCode: "USD" },
          }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            recommendedClientPrice: { amount: 30000, currencyCode: "USD" },
            recommendedPriceRange: {
              low: { amount: 14000, currencyCode: "USD" },
              high: { amount: 24000, currencyCode: "USD" },
            },
          }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      /lie within recommendedPriceRange/,
    );
  });

  it("public API ↔ LicenseeEstimateClient field contract remains aligned", () => {
    const pub = read("services/estimate/athenaEstimatePublic.ts");
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );

    for (const field of [
      "recommendedClientPrice",
      "relationshipConnected",
      "organizationNameSnapshot",
      "generationStage",
      "errorMessage",
      "package",
    ]) {
      assert.match(pub, new RegExp(field));
      assert.match(client, new RegExp(field));
    }

    assert.match(client, /item\.request\.projectNeed/);
    assert.match(client, /pkg\.recommendedPriceRange/);
    assert.match(client, /pkg\.guidanceDisclaimer/);
    assert.match(client, /href="\/licensee\/quote"/);
    assert.doesNotMatch(client, /localStorage|sessionStorage/);
  });

  it("status/stage string contracts align across types, migration, and UI", () => {
    const types = read("services/estimate/athenaEstimateTypes.ts");
    const migration = read(MIGRATION);
    const helpers = read("components/licensee/estimate/estimateUiHelpers.ts");
    const jobTypes = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobTypes.ts",
    );

    for (const status of [
      "Queued",
      "Processing",
      "Ready",
      "Processing Failed",
    ]) {
      assert.match(types, new RegExp(`"${status}"`));
      assert.match(migration, new RegExp(`'${status}'`));
    }

    for (const status of [
      "queued",
      "processing",
      "completed",
      "failed",
      "retryable",
    ]) {
      assert.match(jobTypes, new RegExp(`"${status}"`));
      assert.match(migration, new RegExp(`'${status}'`));
    }

    for (const stage of [
      "asserting_authorization",
      "loading_instruction",
      "assembling_context",
      "generating_estimate",
      "validating",
      "completed",
      "failed",
    ]) {
      assert.match(types, new RegExp(`"${stage}"`));
      assert.match(helpers, new RegExp(`${stage}:`));
    }
  });
});
