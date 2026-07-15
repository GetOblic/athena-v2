import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  findProspectLinkedInLengthViolations,
  PROSPECT_LINKEDIN_ASSET_MAX_CHARS,
  unwrapProspectDeploymentAssetResponse,
  validateProspectDeploymentAssetPayload,
} from "../../lib/prospectDeploymentAssetContract";
import { LINKEDIN_PROSPECT_ASSET_GENERATION_RULES } from "../../services/ai/prompts/linkedinProspectAssetConstraints";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function labeledBlockWithBodies(
  bodies: Partial<Record<(typeof REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS)[number], string>>,
  defaultBody = "Content for this channel.",
): string {
  return REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map((key) => {
    const body = bodies[key] ?? defaultBody;
    return `${key}:\n${body}`;
  }).join("\n\n");
}

describe("V6 Sprint 2 — Prospect LinkedIn 200-character limit", () => {
  it("exactly 200 characters is accepted for both LinkedIn assets", () => {
    const exact = "A".repeat(PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
    assert.equal(exact.length, 200);

    const payload = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: exact,
      LINKEDIN_FOLLOW_UP: exact,
    });
    const result = validateProspectDeploymentAssetPayload(payload);
    assert.equal(result.isComplete, true);
    assert.equal(result.isValid, true);
    assert.equal(result.failureReason, null);
    assert.deepEqual(findProspectLinkedInLengthViolations(payload), []);
  });

  it("201 characters is rejected for LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP", () => {
    const over = "A".repeat(PROSPECT_LINKEDIN_ASSET_MAX_CHARS + 1);
    assert.equal(over.length, 201);

    const connectionOver = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: over,
    });
    const connectionResult =
      unwrapProspectDeploymentAssetResponse(connectionOver);
    assert.equal(connectionResult.isComplete, false);
    assert.equal(connectionResult.isValid, false);
    assert.equal(
      connectionResult.failureReason,
      "linkedin_asset_exceeds_200_characters",
    );
    assert.deepEqual(findProspectLinkedInLengthViolations(connectionOver), [
      { key: "LINKEDIN_CONNECTION", length: 201 },
    ]);

    const followUpOver = labeledBlockWithBodies({
      LINKEDIN_FOLLOW_UP: over,
    });
    const followUpResult = unwrapProspectDeploymentAssetResponse(followUpOver);
    assert.equal(followUpResult.isComplete, false);
    assert.equal(
      followUpResult.failureReason,
      "linkedin_asset_exceeds_200_characters",
    );
    assert.deepEqual(findProspectLinkedInLengthViolations(followUpOver), [
      { key: "LINKEDIN_FOLLOW_UP", length: 201 },
    ]);
  });

  it("unrelated deployment assets remain unaffected by the LinkedIn limit", () => {
    const longEmail = "E".repeat(4_000);
    const payload = labeledBlockWithBodies({
      PERSONALIZED_OUTREACH_EMAIL: longEmail,
      FOLLOW_UP_EMAIL: longEmail,
      LINKEDIN_CONNECTION: "Short connection note.",
      LINKEDIN_FOLLOW_UP: "Short follow-up note.",
    });
    const result = validateProspectDeploymentAssetPayload(payload);
    assert.equal(result.isComplete, true);
    assert.deepEqual(findProspectLinkedInLengthViolations(payload), []);
  });

  it("generation instructions contain the 200-character requirement", () => {
    assert.match(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /no more than 200 characters/i,
    );
    assert.match(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /including spaces and punctuation/i,
    );
    assert.match(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /LINKEDIN_CONNECTION/,
    );
    assert.match(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /LINKEDIN_FOLLOW_UP/,
    );

    const channelGuide = read(
      "services/ai/prompts/prospectDeploymentAssetsConstraints.ts",
    );
    assert.match(
      channelGuide,
      /LINKEDIN_CONNECTION[\s\S]*hard maximum 200 characters/,
    );
    assert.match(
      channelGuide,
      /LINKEDIN_FOLLOW_UP[\s\S]*hard maximum 200 characters/,
    );

    const assembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.match(assembly, /LINKEDIN_PROSPECT_ASSET_GENERATION_RULES/);
    const prospectBranch = assembly.slice(
      assembly.indexOf("const qualityStandard = isProspectSource"),
      assembly.indexOf("? DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS"),
    );
    assert.match(prospectBranch, /LINKEDIN_PROSPECT_ASSET_GENERATION_RULES/);
  });

  it("over-limit LinkedIn assets cannot be published as complete", () => {
    const over = "B".repeat(201);
    const payload = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: over,
      LINKEDIN_FOLLOW_UP: "Ok",
    });
    const validation = validateProspectDeploymentAssetPayload(payload);
    assert.equal(validation.isComplete, false);
    assert.equal(
      validation.failureReason,
      "linkedin_asset_exceeds_200_characters",
    );

    const workflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(
      workflow,
      /linkedin_asset_exceeds_200_characters/,
    );
    assert.match(
      workflow,
      /IncompleteProspectDeploymentAssetsError/,
    );

    const publication = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    assert.match(publication, /validateProspectDeploymentAssetPayload/);
    assert.match(publication, /IncompleteProspectPublicationError/);
  });

  it("Discussion deployment asset path does not import LinkedIn Prospect length rules", () => {
    const discussionInstructions = read(
      "services/ai/prompts/deploymentAssetsInstructions.ts",
    );
    assert.doesNotMatch(
      discussionInstructions,
      /LINKEDIN_CONNECTION|200 characters/,
    );
  });
});
