import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sanitizeDeploymentAssetGenerationInput } from "../../lib/sanitizeDeploymentAssetGenerationInput";
import { finalizeProspectDeploymentAssetsWithLinkedInRepair } from "../../lib/prospectLinkedInAssetRepair";
import {
  PROSPECT_LINKEDIN_ASSET_MAX_CHARS,
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  validateProspectDeploymentAssetPayload,
} from "../../lib/prospectDeploymentAssetContract";
import { LINKEDIN_PROSPECT_ASSET_GENERATION_RULES } from "../../services/ai/prompts/linkedinProspectAssetConstraints";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function labeledBlock(overLinkedIn = false): string {
  const linkedIn = overLinkedIn
    ? "A".repeat(PROSPECT_LINKEDIN_ASSET_MAX_CHARS + 40)
    : "Short LinkedIn note with a clear ask.";
  return REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map((key) => {
    if (key === "LINKEDIN_CONNECTION" || key === "LINKEDIN_FOLLOW_UP") {
      return `${key}:\n${linkedIn}`;
    }
    return `${key}:\nContent for ${key}.`;
  }).join("\n\n");
}

describe("V6 Sprint 3.2 — Deployment prompt sanitization", () => {
  it("1-9. blanks deployment copy and preserves advisory fields", () => {
    const originalAnalysis = {
      id: "analysis-1",
      summary: "Advisory summary stays",
      sentiment: "positive",
      intent: "buy",
      buyer_stage: "consideration",
      pain_points: ["latency"],
      opportunity_reason: "Budget signal",
      recommended_action: "Book discovery",
      risk_level: "low",
      confidence: 82,
      suggested_cta: labeledBlock(),
      raw_json: {
        deployment_assets: {
          raw_ai_response: labeledBlock(),
          regeneration_run_id: "old-run",
        },
        website_intelligence: { about: "Keep website intel" },
        other_key: "keep-me",
      },
    };
    const originalOpportunity = {
      id: "opp-1",
      title: "Opportunity title",
      reason: "Opportunity reason",
      score: 77,
      suggested_cta: labeledBlock(),
    };
    const originalBriefing = {
      id: "review-1",
      summary: "Briefing summary",
      pain_points: ["cost"],
      buyer_stage: "decision",
      recommended_response: labeledBlock(),
      cta: "Book a call",
      raw_json: {
        deployment_assets: { raw_ai_response: "old" },
        note: "keep-briefing-note",
      },
    };

    const analysisBefore = JSON.stringify(originalAnalysis);
    const opportunityBefore = JSON.stringify(originalOpportunity);
    const briefingBefore = JSON.stringify(originalBriefing);

    const sanitized = sanitizeDeploymentAssetGenerationInput({
      analysis: originalAnalysis,
      opportunity: originalOpportunity,
      briefing: originalBriefing,
    });

    // 13. originals unchanged
    assert.equal(JSON.stringify(originalAnalysis), analysisBefore);
    assert.equal(JSON.stringify(originalOpportunity), opportunityBefore);
    assert.equal(JSON.stringify(originalBriefing), briefingBefore);

    // 1/2/3 analysis
    assert.equal(sanitized.analysis.suggested_cta, "");
    assert.equal(
      (sanitized.analysis.raw_json as Record<string, unknown>).deployment_assets,
      undefined,
    );
    assert.deepEqual(
      (sanitized.analysis.raw_json as Record<string, unknown>)
        .website_intelligence,
      { about: "Keep website intel" },
    );
    assert.equal(
      (sanitized.analysis.raw_json as Record<string, unknown>).other_key,
      "keep-me",
    );

    // 4/5/6 opportunity + briefing deployment mirrors
    assert.equal(sanitized.opportunity?.suggested_cta, "");
    assert.equal(sanitized.briefing?.recommended_response, "");
    assert.equal(sanitized.briefing?.cta, "");
    assert.equal(
      (sanitized.briefing?.raw_json as Record<string, unknown>)
        .deployment_assets,
      undefined,
    );
    assert.equal(
      (sanitized.briefing?.raw_json as Record<string, unknown>).note,
      "keep-briefing-note",
    );

    // 7/8/9 advisory preserved
    assert.equal(sanitized.analysis.summary, "Advisory summary stays");
    assert.equal(sanitized.analysis.sentiment, "positive");
    assert.equal(sanitized.analysis.intent, "buy");
    assert.equal(sanitized.analysis.buyer_stage, "consideration");
    assert.deepEqual(sanitized.analysis.pain_points, ["latency"]);
    assert.equal(sanitized.analysis.opportunity_reason, "Budget signal");
    assert.equal(sanitized.analysis.recommended_action, "Book discovery");
    assert.equal(sanitized.analysis.risk_level, "low");
    assert.equal(sanitized.analysis.confidence, 82);
    assert.equal(sanitized.opportunity?.title, "Opportunity title");
    assert.equal(sanitized.opportunity?.reason, "Opportunity reason");
    assert.equal(sanitized.opportunity?.score, 77);
    assert.equal(sanitized.briefing?.summary, "Briefing summary");
    assert.deepEqual(sanitized.briefing?.pain_points, ["cost"]);
    assert.equal(sanitized.briefing?.buyer_stage, "decision");

    assert.ok(sanitized.removedFields.includes("analysis.suggested_cta"));
    assert.ok(
      sanitized.removedFields.includes("analysis.raw_json.deployment_assets"),
    );
    assert.ok(sanitized.removedFields.includes("opportunity.suggested_cta"));
    assert.ok(
      sanitized.removedFields.includes("briefing.recommended_response"),
    );
    assert.ok(sanitized.removedFields.includes("briefing.cta"));
  });

  it("10-12/21. sanitized JSON for prompt no longer includes prior labeled deployment block", () => {
    const marker = "UNIQUE_PRIOR_DEPLOYMENT_MARKER_7f2c";
    const contaminated = `${labeledBlock()}\n\nPERSONALIZED_OUTREACH_EMAIL:\n${marker}`;

    const sanitized = sanitizeDeploymentAssetGenerationInput({
      analysis: {
        summary: "Keep summary",
        suggested_cta: contaminated,
        raw_json: {
          deployment_assets: { raw_ai_response: contaminated },
          website_intelligence: { positioning: "Keep positioning" },
          prospect_metadata: { business_name: "Acme Prospect" },
        },
      },
      opportunity: {
        title: "Keep title",
        suggested_cta: contaminated,
      },
      briefing: {
        summary: "Keep briefing summary",
        recommended_response: contaminated,
        cta: marker,
      },
    });

    // Mirror the SOURCE INTELLIGENCE shape used by deploymentAssetsPromptAssembly.
    const sourceIntelligence = JSON.stringify(
      {
        discussion: {
          id: "d1",
          title: "Prospect Acme",
          body: "SOURCE_DISCUSSION_BODY_MARKER",
        },
        analysis: sanitized.analysis,
        opportunity: sanitized.opportunity ?? null,
        briefing: sanitized.briefing
          ? {
              summary: sanitized.briefing.summary,
              pain_points: sanitized.briefing.pain_points,
              buyer_stage: sanitized.briefing.buyer_stage,
            }
          : null,
      },
      null,
      2,
    );

    assert.doesNotMatch(sourceIntelligence, new RegExp(marker));
    assert.doesNotMatch(sourceIntelligence, /LINKEDIN_CONNECTION:\\nA{10,}/);
    assert.match(sourceIntelligence, /Keep summary/);
    assert.match(sourceIntelligence, /Keep title/);
    assert.match(sourceIntelligence, /Keep briefing summary/);
    assert.match(sourceIntelligence, /Keep positioning/);
    assert.match(sourceIntelligence, /Acme Prospect/);
    assert.match(sourceIntelligence, /SOURCE_DISCUSSION_BODY_MARKER/);
    assert.equal(sanitized.analysis.suggested_cta, "");
    assert.equal(sanitized.opportunity?.suggested_cta, "");
  });

  it("14/15. deployment refresh uses sanitization; strategic refresh does not", () => {
    const deploymentWorkflow = read(
      "services/workflows/deploymentAssetsWorkflow.ts",
    );
    assert.match(
      deploymentWorkflow,
      /sanitizeDeploymentAssetGenerationInput/,
    );
    assert.match(
      deploymentWorkflow,
      /logDeploymentAssetPromptSanitization/,
    );

    const partial = read("services/workflows/partialRefreshWorkflow.ts");
    assert.match(partial, /triggerType:\s*"deployment_assets_refresh"/);
    assert.match(partial, /generateDeploymentAssets/);

    const strategicSlice = partial.slice(
      partial.indexOf("async function runStrategicPartialRefresh"),
    );
    assert.doesNotMatch(
      strategicSlice,
      /sanitizeDeploymentAssetGenerationInput/,
    );
    assert.doesNotMatch(strategicSlice, /generateDeploymentAssets/);
  });

  it("16/17. full generation and append still use generateDeploymentAssets pipeline", () => {
    const discussionWorkflow = read(
      "services/workflows/discussionWorkflow.ts",
    );
    assert.match(discussionWorkflow, /generateDeploymentAssets/);
    assert.match(discussionWorkflow, /processDiscussionEndToEnd/);

    const updates = read("app/api/prospects/[id]/updates/route.ts");
    assert.match(updates, /discussion_update/);
  });

  it("18-20. partial refresh publication contract remains carry-forward + new deployment", () => {
    const partial = read("services/workflows/partialRefreshWorkflow.ts");
    assert.match(partial, /\.\.\.input\.sourceIntel\.analysis/);
    assert.match(partial, /suggested_cta:\s*persisted\.analysis\.suggested_cta/);
    assert.match(partial, /blueprint:\s*input\.sourceIntel\.blueprint/);
    assert.match(partial, /publishPartialRefreshExecutiveVersion/);
  });

  it("22. LinkedIn prompt uses approximate/preferably under wording", () => {
    assert.match(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /Target approximately 200 characters/i,
    );
    assert.match(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /Preferably remain under 200 characters/i,
    );
    assert.doesNotMatch(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /must be no more than 200 characters/i,
    );
    assert.doesNotMatch(
      LINKEDIN_PROSPECT_ASSET_GENERATION_RULES,
      /Do not exceed 200 characters/i,
    );

    const channelGuide = read(
      "services/ai/prompts/prospectDeploymentAssetsConstraints.ts",
    );
    assert.match(
      channelGuide,
      /target approximately \$\{PROSPECT_LINKEDIN_ASSET_MAX_CHARS\}/,
    );
    assert.doesNotMatch(channelGuide, /hard maximum 200 characters/);
  });

  it("23-26. deterministic ≤200 repair remains active; Discussion path unaffected", () => {
    const over = labeledBlock(true);
    const finalized = finalizeProspectDeploymentAssetsWithLinkedInRepair({
      rawText: over,
    });
    assert.equal(finalized.isComplete, true);
    assert.equal(
      validateProspectDeploymentAssetPayload(finalized.suggestedCta).isComplete,
      true,
    );

    const exact = "B".repeat(PROSPECT_LINKEDIN_ASSET_MAX_CHARS);
    const exactPayload = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map((key) => {
      if (key === "LINKEDIN_CONNECTION" || key === "LINKEDIN_FOLLOW_UP") {
        return `${key}:\n${exact}`;
      }
      return `${key}:\nContent for ${key}.`;
    }).join("\n\n");
    assert.equal(
      validateProspectDeploymentAssetPayload(exactPayload).isComplete,
      true,
    );

    const workflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(
      workflow,
      /finalizeProspectDeploymentAssetsWithLinkedInRepair/,
    );
    const discussionBranch = workflow.slice(
      workflow.indexOf("return {\n    assets: parseDeploymentAssetsResponse"),
    );
    assert.doesNotMatch(
      discussionBranch,
      /finalizeProspectDeploymentAssetsWithLinkedInRepair/,
    );
  });
});
