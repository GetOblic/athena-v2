import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildDiscussionDeploymentAssets,
  buildPersonaAnalysisAssets,
} from "../../lib/deploymentAssets";
import {
  REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
  REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS,
  extractPersonaDeploymentAssetKeys,
  isCompletePersonaDeploymentAssetSet,
  missingPersonaDeploymentAssetKeys,
  personaDeploymentAssetTitle,
  unwrapPersonaDeploymentAssetResponse,
  validatePersonaDeploymentAssetPayload,
  IncompletePersonaPublicationError,
} from "../../lib/personaDeploymentAssetContract";
import {
  combinePersonaIntelligencePackages,
  requirePersonaCompleteness,
} from "../../lib/personaIntelligenceAssetCatalog";
import { REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "../../lib/prospectDeploymentAssetContract";
import { OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS } from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import { PERSONA_ANALYSIS_ASSET_META } from "../../services/ai/prompts/personaDeploymentAssetsConstraints";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";

const ROOT = process.cwd();

function labeledBlock(
  keys: readonly string[] = REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
  body?: string,
): string {
  return keys
    .map((key, index) => `${key}:\n${body ?? `Persona content for ${key} (${index}).`}`)
    .join("\n\n");
}

const EXPECTED_TITLES: Record<string, string> = {
  PERSONA_EXECUTIVE_PROFILE: "Persona Executive Profile",
  MESSAGING_FRAMEWORK: "Messaging Framework",
  VALUE_PROPOSITION: "Value Proposition",
  OBJECTION_HANDLING: "Objection Handling",
  LANGUAGE_AND_TONE_GUIDE: "Language and Tone Guide",
  OFFER_POSITIONING: "Offer Positioning",
  CHANNEL_STRATEGY: "Channel Strategy",
  CAMPAIGN_CONCEPTS: "Campaign Concepts",
  CONTENT_THEMES: "Content Themes",
  ADVERTISEMENT_CONCEPTS: "Advertisement Concepts",
  LANDING_PAGE_DIRECTION: "Landing Page Direction",
  VISUAL_AND_IMAGE_PROMPT_DIRECTION: "Visual and Image Prompt Direction",
  CUSTOMER_EXPERIENCE_GUIDANCE: "Customer Experience Guidance",
  VALIDATION_AND_LEARNING_PLAN: "Validation and Learning Plan",
};

describe("persona stage-4 Analysis Asset contract (V15 reframed)", () => {
  it("requires exactly 14 Analysis keys in deterministic order with exact titles", () => {
    assert.equal(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.length, 14);
    assert.deepEqual(
      [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS],
      [...REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS],
    );
    assert.deepEqual([...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS], [
      "PERSONA_EXECUTIVE_PROFILE",
      "MESSAGING_FRAMEWORK",
      "VALUE_PROPOSITION",
      "OBJECTION_HANDLING",
      "LANGUAGE_AND_TONE_GUIDE",
      "OFFER_POSITIONING",
      "CHANNEL_STRATEGY",
      "CAMPAIGN_CONCEPTS",
      "CONTENT_THEMES",
      "ADVERTISEMENT_CONCEPTS",
      "LANDING_PAGE_DIRECTION",
      "VISUAL_AND_IMAGE_PROMPT_DIRECTION",
      "CUSTOMER_EXPERIENCE_GUIDANCE",
      "VALIDATION_AND_LEARNING_PLAN",
    ]);

    for (const key of REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS) {
      assert.equal(personaDeploymentAssetTitle(key), EXPECTED_TITLES[key]);
      assert.equal(PERSONA_ANALYSIS_ASSET_META[key].title, EXPECTED_TITLES[key]);
    }
  });

  it("accepts complete Analysis set and rejects missing or empty bodies", () => {
    const complete = unwrapPersonaDeploymentAssetResponse(labeledBlock());
    assert.equal(complete.isComplete, true);
    assert.equal(complete.parsedKeys.length, 14);
    assert.deepEqual(complete.missingKeys, []);

    const missing = unwrapPersonaDeploymentAssetResponse(
      labeledBlock(REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.slice(0, 10)),
    );
    assert.equal(missing.isComplete, false);
    assert.equal(missing.missingKeys.length, 4);

    const emptyBody = unwrapPersonaDeploymentAssetResponse(
      "PERSONA_EXECUTIVE_PROFILE:\n\nMESSAGING_FRAMEWORK:\nbody",
    );
    assert.equal(
      extractPersonaDeploymentAssetKeys(emptyBody.suggestedCta).includes(
        "PERSONA_EXECUTIVE_PROFILE",
      ),
      false,
    );
  });

  it("rejects Prospect keys and unlabeled prose for Persona Analysis completeness", () => {
    const prospectBlock = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map(
      (key) => `${key}:\nProspect body`,
    ).join("\n\n");
    const asPersona = validatePersonaDeploymentAssetPayload(prospectBlock);
    assert.equal(asPersona.isComplete, false);
    assert.equal(asPersona.parsedKeys.length, 0);

    const prose = unwrapPersonaDeploymentAssetResponse(
      "This persona likes email and social channels.",
    );
    assert.equal(prose.isComplete, false);
    assert.equal(prose.parsedKeys.length, 0);
  });

  it("keeps Prospect required tuple free of Persona Analysis keys", () => {
    for (const key of REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS) {
      assert.equal(
        (REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(
          key,
        ),
        false,
        `Persona Analysis key ${key} must not appear in Prospect required tuple`,
      );
    }
  });

  it("requirePersonaCompleteness needs blueprint + V15 dual packages", () => {
    const deployment = labeledBlock([
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
      ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ]);
    const analysis = labeledBlock();
    const combined = combinePersonaIntelligencePackages({
      deploymentCta: deployment,
      analysisCta: analysis,
    });

    assert.throws(
      () =>
        requirePersonaCompleteness({
          suggestedCta: combined,
          blueprintId: null,
        }),
      IncompletePersonaPublicationError,
    );
    assert.throws(
      () =>
        requirePersonaCompleteness({
          suggestedCta: labeledBlock(
            REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.slice(0, 8),
          ),
          blueprintId: "bp-1",
        }),
      IncompletePersonaPublicationError,
    );
    // Legacy Analysis-only is not newly publishable under V15.
    assert.throws(
      () =>
        requirePersonaCompleteness({
          suggestedCta: labeledBlock(),
          blueprintId: "bp-1",
        }),
      IncompletePersonaPublicationError,
    );
    assert.doesNotThrow(() =>
      requirePersonaCompleteness({
        suggestedCta: combined,
        blueprintId: "bp-1",
      }),
    );
  });

  it("never collapses Persona bridges into Primary Reply; Analysis stays Analysis", () => {
    const assets = buildDiscussionDeploymentAssets(
      { suggested_cta: "Unlabeled prose only" } as DiscussionAnalysis,
      { personaMode: true },
    );
    assert.equal(assets.length, 0);

    const labeled = buildPersonaAnalysisAssets(labeledBlock());
    assert.equal(labeled.length, 14);
    assert.equal(labeled[0].title, "Persona Executive Profile");
    assert.doesNotMatch(labeled.map((a) => a.title).join("|"), /Primary Reply/);

    // Legacy Analysis-only CTA must not appear as Persona Deployment Assets.
    const deploymentFromLegacy = buildDiscussionDeploymentAssets(
      { suggested_cta: labeledBlock() } as DiscussionAnalysis,
      { personaMode: true },
    );
    assert.equal(deploymentFromLegacy.length, 0);
  });

  it("safe heading unwrap accepts JSON-wrapped canonical Analysis output", () => {
    const raw = JSON.stringify({
      suggested_cta: labeledBlock(),
      recommended_response: labeledBlock(),
      cta: "Validate with a cheap test",
    });
    const result = unwrapPersonaDeploymentAssetResponse(raw);
    assert.equal(result.isComplete, true);
    assert.equal(result.cta, "Validate with a cheap test");
    assert.equal(isCompletePersonaDeploymentAssetSet(result.parsedKeys), true);
    assert.deepEqual(missingPersonaDeploymentAssetKeys(result.parsedKeys), []);
  });

  it("documents V15 dual-package Decision: publishable Deployment reuses Prospect catalog", () => {
    const constraints = readFileSync(
      join(ROOT, "services/ai/prompts/personaDeploymentAssetsConstraints.ts"),
      "utf8",
    );
    assert.match(constraints, /Persona Analysis Asset/i);
    assert.match(constraints, /Publish-ready Deployment Assets/);
    const catalog = readFileSync(
      join(ROOT, "lib/personaIntelligenceAssetCatalog.ts"),
      "utf8",
    );
    assert.match(catalog, /getPersonaPublishableDeploymentCatalogKeys/);
    assert.match(catalog, /OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS/);
  });
});
