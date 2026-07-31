import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildPersonaAnalysisAssets,
  buildPersonaPublishableDeploymentAssets,
  buildDiscussionDeploymentAssets,
} from "../../lib/deploymentAssets";
import {
  REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
  IncompletePersonaDeploymentAssetsError,
  IncompletePersonaPublicationError,
  unwrapPersonaAnalysisAssetResponse,
} from "../../lib/personaDeploymentAssetContract";
import {
  combinePersonaIntelligencePackages,
  finalizePersonaV15CombinedPackage,
  getPersonaPublishableDeploymentCatalogKeys,
  isCompleteV15PersonaIntelligenceCta,
  isLegacyPersonaAnalysisOnlyCta,
  normalizePersonaPublishableDeploymentAliases,
  requirePersonaCompleteness,
  splitPersonaIntelligenceSuggestedCta,
} from "../../lib/personaIntelligenceAssetCatalog";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  unwrapProspectDeploymentAssetResponse,
} from "../../lib/prospectDeploymentAssetContract";
import { getProspectDeploymentGenerationHeadings } from "../../services/brain/generationContracts/deploymentAssetsRequiredOutput";
import { OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";

const ROOT = process.cwd();

function labeledBlock(keys: readonly string[], bodyPrefix = "Body"): string {
  return keys
    .map((key, index) => `${key}:\n${bodyPrefix} for ${key} (${index}).`)
    .join("\n\n");
}

const FULL_DEPLOYMENT = labeledBlock([
  ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
]);
const FULL_ANALYSIS = labeledBlock(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS);

describe("persona V15 catalog parity", () => {
  it("Persona Deployment Asset catalog keys equal Prospect Deployment Asset catalog keys (26)", () => {
    const personaKeys = getPersonaPublishableDeploymentCatalogKeys();
    const prospectKeys = getProspectDeploymentGenerationHeadings();

    assert.equal(personaKeys.length, 26);
    assert.equal(prospectKeys.length, 26);
    assert.deepEqual(personaKeys, prospectKeys);
    assert.deepEqual(personaKeys, [
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
      ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ]);
  });
});

describe("persona V15 objection key collision", () => {
  it("keeps OBJECTION_HANDLING in Analysis and OBJECTION_ANTICIPATION in Deployment", () => {
    const deploymentWithAnticipation = labeledBlock([
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ]);
    const analysisWithHandling = labeledBlock(
      REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
    );
    const combined = combinePersonaIntelligencePackages({
      deploymentCta: deploymentWithAnticipation,
      analysisCta: analysisWithHandling,
    });

    const split = splitPersonaIntelligenceSuggestedCta(combined);
    assert.ok(split.deploymentKeys.includes("OBJECTION_ANTICIPATION"));
    assert.ok(split.analysisKeys.includes("OBJECTION_HANDLING"));
    assert.equal(
      split.deploymentKeys.includes("OBJECTION_HANDLING"),
      false,
      "Analysis OBJECTION_HANDLING must not appear under Deployment",
    );
    assert.equal(
      split.analysisKeys.includes("OBJECTION_ANTICIPATION" as never),
      false,
    );

    // Persona split must not let Prospect aliasing satisfy Deployment readiness
    // from Analysis-only OBJECTION_HANDLING.
    const analysisOnly = labeledBlock(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS);
    const analysisOnlySplit = splitPersonaIntelligenceSuggestedCta(analysisOnly);
    assert.equal(analysisOnlySplit.deploymentKeys.length, 0);
    assert.equal(
      analysisOnlySplit.deploymentKeys.includes("OBJECTION_ANTICIPATION"),
      false,
    );
    assert.ok(analysisOnlySplit.analysisKeys.includes("OBJECTION_HANDLING"));
    // Prospect unwrap may alias for Prospect paths — Persona Ready must ignore that.
    const prospectView = unwrapProspectDeploymentAssetResponse(analysisOnly);
    assert.equal(
      isCompleteV15PersonaIntelligenceCta(analysisOnly),
      false,
      "Analysis-only CTA is never V15-complete even if Prospect alias sees OBJECTION_HANDLING",
    );
    void prospectView;

    // Explicit collision blob: both keys present with distinct bodies.
    const collisionBlob = [
      "OBJECTION_ANTICIPATION:\nDeploy objection copy",
      "OBJECTION_HANDLING:\nAnalysis objection strategy",
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.filter(
        (k) => k !== "OBJECTION_ANTICIPATION",
      ).map((k) => `${k}:\nD`),
      ...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.filter(
        (k) => k !== "OBJECTION_HANDLING",
      ).map((k) => `${k}:\nA`),
    ].join("\n\n");

    const collisionSplit = splitPersonaIntelligenceSuggestedCta(collisionBlob);
    assert.match(collisionSplit.deploymentCta, /Deploy objection copy/);
    assert.match(collisionSplit.analysisCta, /Analysis objection strategy/);
    assert.doesNotMatch(collisionSplit.deploymentCta, /Analysis objection strategy/);
    assert.doesNotMatch(collisionSplit.analysisCta, /Deploy objection copy/);

    const deploymentAssets = buildPersonaPublishableDeploymentAssets(collisionBlob);
    const analysisAssets = buildPersonaAnalysisAssets(collisionBlob);
    assert.ok(
      deploymentAssets.some((a) => a.title === "Objection Anticipation"),
    );
    assert.ok(analysisAssets.some((a) => a.title === "Objection Handling"));
    assert.ok(
      analysisAssets.some((a) => a.assetKey === "objection_handling"),
      "Analysis OBJECTION_HANDLING must use distinct interaction key",
    );
  });
});

describe("persona V15 combine / completeness / historical", () => {
  it("combines packages in required → optional → analysis order", () => {
    const combined = combinePersonaIntelligencePackages({
      deploymentCta: FULL_DEPLOYMENT,
      analysisCta: FULL_ANALYSIS,
    });
    const firstDeployment = combined.indexOf("PERSONALIZED_OUTREACH_EMAIL:");
    const firstOptional = combined.indexOf("WHATSAPP_OUTREACH:");
    const firstAnalysis = combined.indexOf("PERSONA_EXECUTIVE_PROFILE:");
    assert.ok(firstDeployment >= 0);
    assert.ok(firstOptional > firstDeployment);
    assert.ok(firstAnalysis > firstOptional);
    assert.equal(isCompleteV15PersonaIntelligenceCta(combined), true);
  });

  it("requirePersonaCompleteness needs blueprint + 14 Deployment + 14 Analysis", () => {
    const combined = combinePersonaIntelligencePackages({
      deploymentCta: FULL_DEPLOYMENT,
      analysisCta: FULL_ANALYSIS,
    });
    assert.doesNotThrow(() =>
      requirePersonaCompleteness({
        suggestedCta: combined,
        blueprintId: "bp-1",
      }),
    );

    assert.throws(
      () =>
        requirePersonaCompleteness({
          suggestedCta: FULL_ANALYSIS,
          blueprintId: "bp-1",
        }),
      IncompletePersonaPublicationError,
    );

    assert.throws(
      () =>
        requirePersonaCompleteness({
          suggestedCta: FULL_DEPLOYMENT,
          blueprintId: "bp-1",
        }),
      IncompletePersonaPublicationError,
    );
  });

  it("treats legacy Analysis-only snapshots as historical display packages", () => {
    assert.equal(isLegacyPersonaAnalysisOnlyCta(FULL_ANALYSIS), true);
    assert.equal(isCompleteV15PersonaIntelligenceCta(FULL_ANALYSIS), false);

    const deploymentAssets = buildPersonaPublishableDeploymentAssets(
      FULL_ANALYSIS,
    );
    const analysisAssets = buildPersonaAnalysisAssets(FULL_ANALYSIS);
    assert.equal(deploymentAssets.length, 0);
    assert.equal(analysisAssets.length, 14);
    assert.equal(analysisAssets[0].title, "Persona Executive Profile");

    const viaDiscussion = buildDiscussionDeploymentAssets(
      { suggested_cta: FULL_ANALYSIS } as DiscussionAnalysis,
      { personaMode: true },
    );
    assert.equal(viaDiscussion.length, 0);
  });
});

/**
 * Simulates the Persona V15 dual-call stage control flow used before
 * persistDeploymentAssets. Returns whether persistence would be reached.
 */
function simulatePersonaV15StagePersistence(input: {
  call1Raw: string;
  call2Raw: string | null;
}): {
  persisted: boolean;
  suggestedCta: string | null;
  errorName: string | null;
} {
  const deploymentUnwrapped = unwrapProspectDeploymentAssetResponse(
    input.call1Raw,
  );
  if (!deploymentUnwrapped.isComplete) {
    return {
      persisted: false,
      suggestedCta: null,
      errorName: "IncompletePersonaDeploymentAssetsError",
    };
  }

  // Call 2 failure: never combine, never persist.
  if (input.call2Raw === null) {
    return {
      persisted: false,
      suggestedCta: null,
      errorName: "IncompletePersonaDeploymentAssetsError",
    };
  }

  const analysisUnwrapped = unwrapPersonaAnalysisAssetResponse(input.call2Raw);
  if (!analysisUnwrapped.isComplete) {
    return {
      persisted: false,
      suggestedCta: null,
      errorName: "IncompletePersonaDeploymentAssetsError",
    };
  }

  try {
    const combinedCta = finalizePersonaV15CombinedPackage({
      deploymentCta: deploymentUnwrapped.suggestedCta,
      analysisCta: analysisUnwrapped.suggestedCta,
    });
    if (!isCompleteV15PersonaIntelligenceCta(combinedCta)) {
      return {
        persisted: false,
        suggestedCta: null,
        errorName: "IncompletePersonaDeploymentAssetsError",
      };
    }
    return {
      persisted: true,
      suggestedCta: combinedCta,
      errorName: null,
    };
  } catch (error) {
    return {
      persisted: false,
      suggestedCta: null,
      errorName:
        error instanceof Error ? error.name : "IncompletePersonaDeploymentAssetsError",
    };
  }
}

function call1WithAliasObjection(): string {
  // Call 1 uses OBJECTION_HANDLING instead of canonical OBJECTION_ANTICIPATION.
  const keys = [
    ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.filter(
      (key) => key !== "OBJECTION_ANTICIPATION",
    ),
    "OBJECTION_HANDLING",
    ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  ];
  return labeledBlock(keys, "Call1");
}

describe("persona V15 Call-1 alias normalization", () => {
  it("normalizes Call-1 OBJECTION_HANDLING to OBJECTION_ANTICIPATION before combine", () => {
    const call1 = call1WithAliasObjection();
    const unwrapped = unwrapProspectDeploymentAssetResponse(call1);
    assert.equal(unwrapped.isComplete, true);
    assert.match(unwrapped.suggestedCta, /OBJECTION_HANDLING:/);

    const normalized = normalizePersonaPublishableDeploymentAliases(
      unwrapped.suggestedCta,
    );
    assert.match(normalized, /OBJECTION_ANTICIPATION:/);
    assert.doesNotMatch(normalized, /OBJECTION_HANDLING:/);

    const combined = combinePersonaIntelligencePackages({
      deploymentCta: normalized,
      analysisCta: FULL_ANALYSIS,
    });
    assert.equal(isCompleteV15PersonaIntelligenceCta(combined), true);
    assert.match(combined, /OBJECTION_ANTICIPATION:/);
    assert.match(combined, /OBJECTION_HANDLING:/);

    const split = splitPersonaIntelligenceSuggestedCta(combined);
    assert.ok(split.deploymentKeys.includes("OBJECTION_ANTICIPATION"));
    assert.ok(split.analysisKeys.includes("OBJECTION_HANDLING"));
  });

  it("raw Call-1 alias without normalization drops Deployment objection on combine", () => {
    const call1 = call1WithAliasObjection();
    const unwrapped = unwrapProspectDeploymentAssetResponse(call1);
    const dropped = combinePersonaIntelligencePackages({
      deploymentCta: unwrapped.suggestedCta,
      analysisCta: FULL_ANALYSIS,
    });
    assert.equal(isCompleteV15PersonaIntelligenceCta(dropped), false);
    assert.doesNotMatch(dropped, /OBJECTION_ANTICIPATION:/);
  });
});

describe("persona V15 post-combine integrity gate", () => {
  it("finalizePersonaV15CombinedPackage normalizes alias and passes completeness", () => {
    const combined = finalizePersonaV15CombinedPackage({
      deploymentCta: call1WithAliasObjection(),
      analysisCta: FULL_ANALYSIS,
    });
    assert.equal(isCompleteV15PersonaIntelligenceCta(combined), true);
    assert.match(combined, /OBJECTION_ANTICIPATION:/);
  });

  it("finalize throws IncompletePersonaDeploymentAssetsError when Analysis incomplete", () => {
    assert.throws(
      () =>
        finalizePersonaV15CombinedPackage({
          deploymentCta: FULL_DEPLOYMENT,
          analysisCta: labeledBlock(
            REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.slice(0, 8),
          ),
        }),
      IncompletePersonaDeploymentAssetsError,
    );
  });

  it("finalize throws when required Deployment key is missing after combine", () => {
    const incompleteDeployment = labeledBlock(
      REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.filter(
        (key) => key !== "MEETING_PREPARATION",
      ),
    );
    assert.throws(
      () =>
        finalizePersonaV15CombinedPackage({
          deploymentCta: incompleteDeployment,
          analysisCta: FULL_ANALYSIS,
        }),
      IncompletePersonaDeploymentAssetsError,
    );
  });

  it("incomplete combined package cannot persist", () => {
    // Prospect unwrap accepts COLD_EMAIL as PERSONALIZED_OUTREACH_EMAIL, but
    // Persona combine only keeps exact catalog headings — so Call 1 "passes"
    // while the combined V15 package is incomplete and must not persist.
    const call1ColdEmailAlias = labeledBlock(
      REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map((key) =>
        key === "PERSONALIZED_OUTREACH_EMAIL" ? "COLD_EMAIL" : key,
      ),
      "Alias",
    );
    const unwrapped = unwrapProspectDeploymentAssetResponse(call1ColdEmailAlias);
    assert.equal(
      unwrapped.isComplete,
      true,
      "Prospect unwrap must accept COLD_EMAIL alias so this exercises the post-combine gate",
    );

    assert.throws(
      () =>
        finalizePersonaV15CombinedPackage({
          deploymentCta: unwrapped.suggestedCta,
          analysisCta: FULL_ANALYSIS,
        }),
      IncompletePersonaDeploymentAssetsError,
    );

    const result = simulatePersonaV15StagePersistence({
      call1Raw: call1ColdEmailAlias,
      call2Raw: FULL_ANALYSIS,
    });
    assert.equal(result.persisted, false);
    assert.equal(result.suggestedCta, null);
    assert.equal(result.errorName, "IncompletePersonaDeploymentAssetsError");
  });

  it("Call 2 failure never reaches persistence", () => {
    const result = simulatePersonaV15StagePersistence({
      call1Raw: FULL_DEPLOYMENT,
      call2Raw: null,
    });
    assert.equal(result.persisted, false);
    assert.equal(result.suggestedCta, null);

    const incompleteCall2 = simulatePersonaV15StagePersistence({
      call1Raw: FULL_DEPLOYMENT,
      call2Raw: labeledBlock(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.slice(0, 5)),
    });
    assert.equal(incompleteCall2.persisted, false);
    assert.equal(incompleteCall2.suggestedCta, null);
  });

  it("complete package persists successfully (including Call-1 alias)", () => {
    const result = simulatePersonaV15StagePersistence({
      call1Raw: call1WithAliasObjection(),
      call2Raw: FULL_ANALYSIS,
    });
    assert.equal(result.persisted, true);
    assert.ok(result.suggestedCta);
    assert.equal(isCompleteV15PersonaIntelligenceCta(result.suggestedCta), true);

    const full = simulatePersonaV15StagePersistence({
      call1Raw: FULL_DEPLOYMENT,
      call2Raw: FULL_ANALYSIS,
    });
    assert.equal(full.persisted, true);
    assert.ok(full.suggestedCta);

    const deploymentAssets = buildPersonaPublishableDeploymentAssets(
      full.suggestedCta,
    );
    const analysisAssets = buildPersonaAnalysisAssets(full.suggestedCta);
    assert.equal(deploymentAssets.length, 26);
    assert.equal(analysisAssets.length, 14);
  });

  it("wires finalize + post-combine gate in deploymentAssetsWorkflow before return", () => {
    const da = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );
    assert.match(da, /finalizePersonaV15CombinedPackage/);
    assert.match(da, /isCompleteV15PersonaIntelligenceCta/);
    assert.match(da, /IncompletePersonaDeploymentAssetsError/);

    const finalizeIdx = da.indexOf("finalizePersonaV15CombinedPackage");
    const completeIdx = da.indexOf("isCompleteV15PersonaIntelligenceCta(combinedCta)");
    const returnIdx = da.indexOf("suggested_cta: combinedCta");
    assert.ok(finalizeIdx > 0);
    assert.ok(completeIdx > finalizeIdx);
    assert.ok(returnIdx > completeIdx);

    const discussion = readFileSync(
      join(ROOT, "services/workflows/discussionWorkflow.ts"),
      "utf8",
    );
    const generateIdx = discussion.indexOf("generateDeploymentAssets({");
    const persistIdx = discussion.indexOf("persistDeploymentAssets({");
    assert.ok(generateIdx > 0 && persistIdx > generateIdx);
  });

  it("keeps distinct assets with identical body text after key-based dedupe", () => {
    const identicalBody = "Same publishable copy for every channel.";
    const deployment = [
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
      ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ]
      .map((key) => `${key}:\n${identicalBody}`)
      .join("\n\n");
    const analysis = REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.map(
      (key) => `${key}:\n${identicalBody}`,
    ).join("\n\n");
    const combined = finalizePersonaV15CombinedPackage({
      deploymentCta: deployment,
      analysisCta: analysis,
    });
    assert.equal(
      buildPersonaPublishableDeploymentAssets(combined).length,
      26,
      "identical bodies must not collapse distinct Deployment asset keys",
    );
    assert.equal(
      buildPersonaAnalysisAssets(combined).length,
      14,
      "identical bodies must not collapse distinct Analysis asset keys",
    );
  });
});
