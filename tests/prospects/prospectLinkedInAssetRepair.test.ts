import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  extractProspectDeploymentAssetSections,
  findProspectLinkedInLengthViolations,
  PROSPECT_LINKEDIN_ASSET_MAX_CHARS,
  unwrapProspectDeploymentAssetResponse,
  validateProspectDeploymentAssetPayload,
} from "../../lib/prospectDeploymentAssetContract";
import {
  finalizeProspectDeploymentAssetsWithLinkedInRepair,
  repairProspectLinkedInLengthViolationsInLabeledCta,
  shortenProspectLinkedInAssetBody,
  sliceToCodePointBoundary,
} from "../../lib/prospectLinkedInAssetRepair";
import { classifyGenerationError } from "../../services/generationJobs/generationJobErrors";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function labeledBlockWithBodies(
  bodies: Partial<
    Record<(typeof REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS)[number], string>
  >,
  defaultBody = "Content for this channel.",
  extras: Array<{ key: string; body: string }> = [],
): string {
  const required = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map((key) => {
    const body = bodies[key] ?? defaultBody;
    return `${key}:\n${body}`;
  }).join("\n\n");
  if (extras.length === 0) return required;
  const extraBlock = extras
    .map((item) => `${item.key}:\n${item.body}`)
    .join("\n\n");
  return `${required}\n\n${extraBlock}`;
}

describe("V6 Sprint 3.1 — Prospect LinkedIn ≤200 deterministic repair", () => {
  it("1/2. LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP at 200 characters remain unchanged", () => {
    const exact = "A".repeat(PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
    const payload = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: exact,
      LINKEDIN_FOLLOW_UP: exact,
    });
    const repaired = repairProspectLinkedInLengthViolationsInLabeledCta(payload);
    assert.equal(repaired.repairs.length, 0);
    assert.equal(repaired.suggestedCta, payload);

    const finalized = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: payload,
    });
    assert.equal(finalized.isComplete, true);
    assert.equal(
      extractProspectDeploymentAssetSections(finalized.suggestedCta).find(
        (s) => s.key === "LINKEDIN_CONNECTION",
      )?.content,
      exact,
    );
    assert.equal(
      extractProspectDeploymentAssetSections(finalized.suggestedCta).find(
        (s) => s.key === "LINKEDIN_FOLLOW_UP",
      )?.content,
      exact,
    );
  });

  it("3/4. over-limit LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP are repaired to ≤200", () => {
    const over = "Word ".repeat(50).trim(); // well over 200
    assert.ok(over.length > PROSPECT_LINKEDIN_ASSET_MAX_CHARS);

    const connectionOnly = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: over,
      LINKEDIN_FOLLOW_UP: "Short follow-up note with a clear ask.",
    });
    const connectionFinal = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: connectionOnly,
    });
    assert.equal(connectionFinal.isComplete, true);
    const connectionBody = extractProspectDeploymentAssetSections(
      connectionFinal.suggestedCta,
    ).find((s) => s.key === "LINKEDIN_CONNECTION")?.content;
    assert.ok(connectionBody);
    assert.ok(connectionBody.length <= PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
    assert.ok(connectionBody.length > 0);

    const followOnly = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: "Short connection note with a clear ask.",
      LINKEDIN_FOLLOW_UP: over,
    });
    const followFinal = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: followOnly,
    });
    assert.equal(followFinal.isComplete, true);
    const followBody = extractProspectDeploymentAssetSections(
      followFinal.suggestedCta,
    ).find((s) => s.key === "LINKEDIN_FOLLOW_UP")?.content;
    assert.ok(followBody);
    assert.ok(followBody.length <= PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
  });

  it("5/6/7/8. both over-limit assets repaired; unrelated assets byte-identical; keys kept; non-empty", () => {
    const overConnection = `Hello ${"x".repeat(220)} thanks`;
    const overFollowUp = `Follow ${"y".repeat(220)} please`;
    const emailBody = "UNIQUE_EMAIL_BODY_MARKER_9f3a::do-not-touch";
    const optionalBody = "UNIQUE_OPTIONAL_SOCIAL_VOICE::preserve-exactly";

    const payload = labeledBlockWithBodies(
      {
        LINKEDIN_CONNECTION: overConnection,
        LINKEDIN_FOLLOW_UP: overFollowUp,
        PERSONALIZED_OUTREACH_EMAIL: emailBody,
      },
      "Content for this channel.",
      [{ key: "SOCIAL_VOICE_POST", body: optionalBody }],
    );

    const beforeEmail = payload.indexOf(emailBody);
    const beforeOptional = payload.indexOf(optionalBody);
    assert.ok(beforeEmail > 0 && beforeOptional > 0);

    const repaired = repairProspectLinkedInLengthViolationsInLabeledCta(payload);
    assert.equal(repaired.repairs.length, 2);
    assert.ok(repaired.suggestedCta.includes(emailBody));
    assert.ok(repaired.suggestedCta.includes(optionalBody));

    // Unrelated bodies remain byte-for-byte present at their content.
    assert.equal(
      extractProspectDeploymentAssetSections(repaired.suggestedCta).find(
        (s) => s.key === "PERSONALIZED_OUTREACH_EMAIL",
      )?.content,
      emailBody,
    );
    assert.match(repaired.suggestedCta, new RegExp(optionalBody));

    const sections = extractProspectDeploymentAssetSections(
      repaired.suggestedCta,
    );
    for (const key of REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS) {
      assert.ok(
        sections.some((s) => s.key === key),
        `missing required key ${key}`,
      );
    }

    const connection = sections.find((s) => s.key === "LINKEDIN_CONNECTION");
    const followUp = sections.find((s) => s.key === "LINKEDIN_FOLLOW_UP");
    assert.ok(connection && connection.content.trim().length > 0);
    assert.ok(followUp && followUp.content.trim().length > 0);
    assert.ok(connection.content.length <= PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
    assert.ok(followUp.content.length <= PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
  });

  it("9/20. repaired payload passes validateProspectDeploymentAssetPayload and still enforces 200", () => {
    const over = "A".repeat(260);
    const payload = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: over,
      LINKEDIN_FOLLOW_UP: over,
    });
    const finalized = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: payload,
    });
    assert.equal(finalized.isComplete, true);
    const validation = validateProspectDeploymentAssetPayload(
      finalized.suggestedCta,
    );
    assert.equal(validation.isComplete, true);
    assert.deepEqual(
      findProspectLinkedInLengthViolations(finalized.suggestedCta),
      [],
    );
  });

  it("10/11/12. initial, full, and partial Prospect generation use the repair path", () => {
    const workflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(
      workflow,
      /finalizeProspectDeploymentAssetsWithLinkedInRepair/,
    );

    const discussionWorkflow = read(
      "services/workflows/discussionWorkflow.ts",
    );
    assert.match(discussionWorkflow, /generateDeploymentAssets/);

    const partial = read("services/workflows/partialRefreshWorkflow.ts");
    assert.match(partial, /generateDeploymentAssets/);
    assert.match(partial, /ProspectLinkedInLengthContractError/);
  });

  it("13/14. over-limit-only output does not throw IncompleteProspect or classify retryable", () => {
    const over = "B".repeat(240);
    const payload = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: over,
    });

    // Raw unwrap still reports the LinkedIn failure reason before repair.
    const raw = unwrapProspectDeploymentAssetResponse(payload);
    assert.equal(raw.failureReason, "linkedin_asset_exceeds_200_characters");

    const finalized = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: payload,
    });
    assert.equal(finalized.isComplete, true);
    assert.equal(finalized.failureReason, null);

    const classified = classifyGenerationError(
      "Prospect LinkedIn Deployment Assets exceed the 200-character limit after repair.",
    );
    assert.equal(classified.classification, "terminal");
    assert.equal(classified.code, "LINKEDIN_LENGTH_CONTRACT");

    const classifiedName = classifyGenerationError(
      Object.assign(new Error("after repair"), {
        name: "ProspectLinkedInLengthContractError",
      }),
    );
    assert.equal(classifiedName.classification, "terminal");
  });

  it("15/16. genuine missing required assets and malformed payloads still fail", () => {
    const missing = "PERSONALIZED_OUTREACH_EMAIL:\nOnly one asset.";
    const missingFinal = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: missing,
    });
    assert.equal(missingFinal.isComplete, false);
    assert.equal(missingFinal.failureReason, "incomplete_canonical_set");

    const malformed = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: "This is unlabeled prose with no headings at all.",
    });
    assert.equal(malformed.isComplete, false);
    assert.ok(malformed.failureReason);
    assert.notEqual(
      malformed.failureReason,
      "linkedin_asset_exceeds_200_characters",
    );
  });

  it("17. Discussion Deployment Assets remain unaffected", () => {
    const workflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    const discussionBranch = workflow.slice(
      workflow.indexOf("return {\n    assets: parseDeploymentAssetsResponse"),
    );
    assert.match(discussionBranch, /parseDeploymentAssetsResponse/);
    assert.doesNotMatch(
      discussionBranch,
      /finalizeProspectDeploymentAssetsWithLinkedInRepair/,
    );

    const discussionInstructions = read(
      "services/ai/prompts/deploymentAssetsInstructions.ts",
    );
    assert.doesNotMatch(
      discussionInstructions,
      /finalizeProspectDeploymentAssetsWithLinkedInRepair/,
    );
  });

  it("18/19. publication path still requires a complete valid payload", () => {
    const publication = read(
      "services/executiveVersions/executiveVersionService.ts",
    );
    assert.match(publication, /validateProspectDeploymentAssetPayload/);
    assert.match(publication, /IncompleteProspectPublicationError/);

    const over = labeledBlockWithBodies({
      LINKEDIN_CONNECTION: "C".repeat(201),
    });
    // Unrepaired over-limit still cannot publish.
    assert.equal(validateProspectDeploymentAssetPayload(over).isComplete, false);

    const repaired = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: over,
    });
    assert.equal(repaired.isComplete, true);
    assert.equal(
      validateProspectDeploymentAssetPayload(repaired.suggestedCta).isComplete,
      true,
    );
  });

  it("shorten helper respects shared constant and surrogate boundaries", () => {
    assert.equal(PROSPECT_LINKEDIN_ASSET_MAX_CHARS, 200);
    const emoji = "🙂".repeat(120);
    const shortened = shortenProspectLinkedInAssetBody(emoji);
    assert.ok(shortened.length <= PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
    assert.ok(shortened.length > 0);
    // No dangling high surrogate at the end.
    const last = shortened.charCodeAt(shortened.length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff));

    const withPair = `hi${String.fromCharCode(0xd83d, 0xde00)}world`;
    const sliced = sliceToCodePointBoundary(withPair, 3);
    assert.equal(sliced, "hi");
  });

  it("shared limit constant is not duplicated as a magic 200 in the repair module", () => {
    const repair = read("lib/prospectLinkedInAssetRepair.ts");
    assert.match(repair, /PROSPECT_LINKEDIN_ASSET_MAX_CHARS/);
    assert.doesNotMatch(
      repair,
      /maxChars:\s*number\s*=\s*200\b/,
    );
    assert.doesNotMatch(repair, /length\s*[<>]=?\s*200\b/);
  });
});
