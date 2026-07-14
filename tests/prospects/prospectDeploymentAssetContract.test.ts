import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  countProspectDeploymentAssetKeys,
  extractProspectDeploymentAssetKeys,
  isCompleteProspectDeploymentAssetSet,
  isStrictlyMoreCompleteProspectCta,
  missingProspectDeploymentAssetKeys,
  toProspectDeploymentAssetDiagnostics,
  unwrapProspectDeploymentAssetResponse,
  validateProspectDeploymentAssetPayload,
} from "../../lib/prospectDeploymentAssetContract";
import type { DiscussionAnalysis } from "../../services/discussionAnalysisService";

function labeledBlock(
  keys: readonly string[] = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  body = "Content for this channel.",
): string {
  return keys.map((key) => `${key}:\n${body}`).join("\n\n");
}

describe("Prospect Deployment Asset contract — unwrap & validate", () => {
  it("1. accepts complete 14-label plain-text output", () => {
    const result = unwrapProspectDeploymentAssetResponse(labeledBlock());
    assert.equal(result.isComplete, true);
    assert.equal(result.parsedKeys.length, 14);
    assert.deepEqual(result.missingKeys, []);
  });

  it("2. accepts complete JSON-wrapped suggested_cta", () => {
    const raw = JSON.stringify({
      suggested_cta: labeledBlock(),
      recommended_response: labeledBlock(),
      cta: "Book a call",
    });
    const result = unwrapProspectDeploymentAssetResponse(raw);
    assert.equal(result.isComplete, true);
    assert.equal(result.cta, "Book a call");
  });

  it("3. accepts complete double-encoded JSON", () => {
    const inner = JSON.stringify({ suggested_cta: labeledBlock() });
    const raw = JSON.stringify({ suggested_cta: inner });
    const result = unwrapProspectDeploymentAssetResponse(raw);
    assert.equal(result.isComplete, true);
    assert.equal(result.parsedKeys.length, 14);
  });

  it("4. rejects partial 1-label output", () => {
    const result = unwrapProspectDeploymentAssetResponse(
      "PERSONALIZED_OUTREACH_EMAIL:\nHello only",
    );
    assert.equal(result.isComplete, false);
    assert.equal(result.parsedKeys.length, 1);
    assert.equal(result.missingKeys.length, 13);
  });

  it("5. rejects partial 8-label output", () => {
    const result = unwrapProspectDeploymentAssetResponse(
      labeledBlock(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.slice(0, 8)),
    );
    assert.equal(result.isComplete, false);
    assert.equal(result.parsedKeys.length, 8);
    assert.equal(result.missingKeys.length, 6);
  });

  it("6. rejects malformed JSON without headings", () => {
    const result = unwrapProspectDeploymentAssetResponse("{not-json");
    assert.equal(result.isValid, false);
    assert.equal(result.parsedKeys.length, 0);
  });

  it("7. rejects prose-only output", () => {
    const result = unwrapProspectDeploymentAssetResponse(
      "This prospect looks promising for outreach next week.",
    );
    assert.equal(result.isValid, false);
  });

  it("8. rejects raw JSON that previously rendered as Primary Reply", () => {
    const raw = JSON.stringify({
      summary: "x",
      notes: "y",
      email: "not a labeled asset block",
    });
    const result = unwrapProspectDeploymentAssetResponse(raw);
    assert.equal(result.parsedKeys.length, 0);

    const assets = buildDiscussionDeploymentAssets(
      { suggested_cta: raw } as DiscussionAnalysis,
      { prospectMode: true },
    );
    assert.equal(assets.length, 0);
  });

  it("9. collapses duplicate labels to unique keys", () => {
    const raw = [
      "PERSONALIZED_OUTREACH_EMAIL:\nFirst",
      "PERSONALIZED_OUTREACH_EMAIL:\nSecond",
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.slice(1).map(
        (key) => `${key}:\nBody`,
      ),
    ].join("\n\n");
    const keys = extractProspectDeploymentAssetKeys(raw);
    assert.equal(
      keys.filter((key) => key === "PERSONALIZED_OUTREACH_EMAIL").length,
      1,
    );
    assert.equal(isCompleteProspectDeploymentAssetSet(keys), true);
  });

  it("10. accepts headings in different order", () => {
    const shuffled = [...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS].reverse();
    const result = unwrapProspectDeploymentAssetResponse(labeledBlock(shuffled));
    assert.equal(result.isComplete, true);
  });

  it("11. ignores instruction examples that mention labels without sections", () => {
    const result = unwrapProspectDeploymentAssetResponse(
      "Use labels like PERSONALIZED_OUTREACH_EMAIL and BLOG_POST_IDEA in your output.",
    );
    assert.equal(result.parsedKeys.length, 0);
  });

  it("12. accepts large but valid output", () => {
    const large = labeledBlock(
      REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
      "A".repeat(4_000),
    );
    const result = unwrapProspectDeploymentAssetResponse(large);
    assert.equal(result.isComplete, true);
    assert.ok(result.unwrappedCharacterCount > 50_000);
  });

  it("object-key JSON shape composes labeled CTA", () => {
    const obj: Record<string, string> = {};
    for (const key of REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS) {
      obj[key] = `Body for ${key}`;
    }
    const result = unwrapProspectDeploymentAssetResponse(JSON.stringify(obj));
    assert.equal(result.isComplete, true);
  });

  it("diagnostics stay bounded and structured", () => {
    const diagnostics = toProspectDeploymentAssetDiagnostics(
      unwrapProspectDeploymentAssetResponse(
        "PERSONALIZED_OUTREACH_EMAIL:\nOnly one",
      ),
    );
    assert.equal(diagnostics.validationResult, "incomplete");
    assert.equal(diagnostics.parsedAssetCount, 1);
    assert.equal(diagnostics.missingCanonicalKeys.length, 13);
  });

  it("strict completeness comparison never downgrades", () => {
    const partial = labeledBlock(
      REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.slice(0, 6),
    );
    const full = labeledBlock();
    assert.equal(isStrictlyMoreCompleteProspectCta(partial, full), true);
    assert.equal(isStrictlyMoreCompleteProspectCta(full, partial), false);
  });

  it("validateProspectDeploymentAssetPayload mirrors heading extraction", () => {
    const full = labeledBlock();
    assert.equal(validateProspectDeploymentAssetPayload(full).isComplete, true);
    assert.equal(countProspectDeploymentAssetKeys(full), 14);
    assert.deepEqual(
      missingProspectDeploymentAssetKeys(
        extractProspectDeploymentAssetKeys(full),
      ),
      [],
    );
  });
});

describe("Prospect display never uses Primary Reply for invalid CTA", () => {
  it("30. invalid JSON never renders as Primary Reply for a Prospect", () => {
    const assets = buildDiscussionDeploymentAssets(
      { suggested_cta: '{"foo":"bar"}' } as DiscussionAnalysis,
      { prospectMode: true },
    );
    assert.deepEqual(assets, []);
  });

  it("41/42. Discussion Primary Reply fallback remains available", () => {
    const assets = buildDiscussionDeploymentAssets({
      suggested_cta: "A plain community reply without labels.",
    } as DiscussionAnalysis);
    assert.equal(assets.length, 1);
    assert.equal(assets[0]?.title, "Primary Reply");
  });
});
