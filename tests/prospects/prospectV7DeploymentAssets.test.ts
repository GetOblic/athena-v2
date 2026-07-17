/**
 * V7 Prospect Deployment Assets:
 * Substack Note, Hidden Gems, Skool Post, Skool Course Idea.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildDiscussionDeploymentAssets,
  canonicalizeDeploymentAssetHeadings,
  parseLabeledDeploymentAssets,
} from "../../lib/deploymentAssets";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  isCompleteProspectDeploymentAssetSet,
  extractProspectDeploymentAssetKeys,
  unwrapProspectDeploymentAssetResponse,
} from "../../lib/prospectDeploymentAssetContract";
import { HIDDEN_GEMS_GENERATION_RULES } from "../../services/ai/prompts/hiddenGemsConstraints";
import {
  OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_META,
} from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import { SKOOL_COURSE_IDEA_GENERATION_RULES } from "../../services/ai/prompts/skoolCourseIdeaConstraints";
import { SKOOL_POST_GENERATION_RULES } from "../../services/ai/prompts/skoolPostConstraints";
import { SUBSTACK_NOTE_GENERATION_RULES } from "../../services/ai/prompts/substackNoteConstraints";
import {
  canonicalDeploymentAssetType,
  isSupportedAssetInteractionType,
} from "../../services/assetInteractions/assetInteractionKeys";
import {
  buildDeploymentAssetsRequiredOutputInstructions,
  getProspectDeploymentGenerationHeadings,
} from "../../services/brain/generationContracts/deploymentAssetsRequiredOutput";
import { composeSuggestedCtaFromRawAssetObject } from "../../services/executiveVersions/executiveVersionDisplay";

const ROOT = join(process.cwd());

const NEW_V7_KEYS = [
  "SUBSTACK_NOTE",
  "HIDDEN_GEMS",
  "SKOOL_POST",
  "SKOOL_COURSE_IDEA",
] as const;

const NEW_V7_INTERACTION_TYPES = [
  "substack_note",
  "hidden_gems",
  "skool_post",
  "skool_course_idea",
] as const;

function labeledRequiredBlock(
  keys: readonly string[] = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  body?: string,
): string {
  return keys
    .map((key) => `${key}:\n${body ?? `Content for ${key}.`}`)
    .join("\n\n");
}

function stubAnalysis(suggestedCta: string) {
  return {
    id: "analysis-1",
    organization_id: "org-1",
    discussion_id: "disc-1",
    community_id: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    suggested_cta: suggestedCta,
    raw_json: null,
    status: "completed",
  } as never;
}

describe("V7 Prospect Deployment Assets — registry and Gemini Flash route", () => {
  it("registers exact identifiers and user-facing labels", () => {
    for (const key of NEW_V7_KEYS) {
      assert.ok(
        (OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(
          key,
        ),
      );
    }
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.SUBSTACK_NOTE.title, "Substack Note");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.HIDDEN_GEMS.title, "Hidden Gems");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.SKOOL_POST.title, "Skool Post");
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.SKOOL_COURSE_IDEA.title,
      "Skool Course Idea",
    );
    assert.equal(canonicalDeploymentAssetType("SUBSTACK_NOTE"), "substack_note");
    assert.equal(canonicalDeploymentAssetType("HIDDEN_GEMS"), "hidden_gems");
    assert.equal(canonicalDeploymentAssetType("SKOOL_POST"), "skool_post");
    assert.equal(
      canonicalDeploymentAssetType("SKOOL_COURSE_IDEA"),
      "skool_course_idea",
    );
  });

  it("1+2) initial and refresh Prospect generation request all four new assets", () => {
    const headings = getProspectDeploymentGenerationHeadings();
    assert.equal(headings.length, 26);
    for (const key of NEW_V7_KEYS) {
      assert.ok(headings.includes(key));
    }

    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    for (const key of NEW_V7_KEYS) {
      assert.match(block, new RegExp(`(?:^|\\n)${key}:(?:\\n|$)`));
    }

    const refreshRoute = readFileSync(
      join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    const importer = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const deploymentWorkflow = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );
    assert.match(refreshRoute, /manual_refresh/);
    assert.match(importer, /enqueueDiscussionGenerationJob/);
    assert.match(deploymentWorkflow, /assembleDeploymentAssetsPrompt/);
    assert.match(deploymentWorkflow, /athenaStage:\s*["']deployment_assets["']/);
  });

  it("3) four assets use existing Prospect Deployment Asset Gemini Flash route", () => {
    const routing = readFileSync(join(ROOT, "lib/llm/modelRouting.ts"), "utf8");
    assert.match(routing, /deployment_assets:\s*roles\.analysis/);
    assert.doesNotMatch(routing, /substack_note|hidden_gems|skool_post|skool_course_idea/);
    assert.doesNotMatch(routing, /prospect_deployment_assets/);

    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /SUBSTACK_NOTE_GENERATION_RULES/);
    assert.match(assembly, /HIDDEN_GEMS_GENERATION_RULES/);
    assert.match(assembly, /SKOOL_POST_GENERATION_RULES/);
    assert.match(assembly, /SKOOL_COURSE_IDEA_GENERATION_RULES/);
    assert.match(assembly, /isProspectSource/);
  });
});

describe("V7 Prospect Deployment Assets — persistence, EV, publication", () => {
  it("4) new Executive Versions persist all four assets when returned", () => {
    const returned = [
      labeledRequiredBlock(),
      "HIDDEN_GEMS:\n- **Finding:** Buried FAQ about membership\n  - **Why it matters:** Visitors miss retention angle\n  - **Opportunity:** Lead with membership outcomes",
      "SUBSTACK_NOTE:\nMost clinics sell treatments. The ones that win sell continuity.",
      "SKOOL_POST:\nTitle:\nWhat changed after you documented your intake?\n\nPost:\nCurious what operators here noticed.",
      "SKOOL_COURSE_IDEA:\nCourse Name:\nIntake Clarity Sprint\n\nShort Description:\nTighten consult-to-close.\n\nCourse Concept:\nFor clinic owners.\n\nRecommended Modules:\n- Module 1\n- Module 2\n- Module 3\n\nPractical Outcome:\nA usable intake script.",
    ].join("\n\n");

    const assets = buildDiscussionDeploymentAssets(stubAnalysis(returned), {
      prospectMode: true,
    });
    const keys = new Set(assets.map((asset) => asset.assetKey));
    for (const key of NEW_V7_INTERACTION_TYPES) {
      assert.ok(keys.has(key), `missing ${key}`);
    }
    assert.equal(
      assets.find((asset) => asset.assetKey === "hidden_gems")?.title,
      "Hidden Gems",
    );
    assert.equal(
      assets.find((asset) => asset.assetKey === "substack_note")?.title,
      "Substack Note",
    );
    assert.equal(
      assets.find((asset) => asset.assetKey === "skool_post")?.title,
      "Skool Post",
    );
    assert.equal(
      assets.find((asset) => asset.assetKey === "skool_course_idea")?.title,
      "Skool Course Idea",
    );

    const composed = composeSuggestedCtaFromRawAssetObject({
      HIDDEN_GEMS: "- **Finding:** x",
      SUBSTACK_NOTE: "Note body",
      SKOOL_POST: "Title:\nT\n\nPost:\nP",
      SKOOL_COURSE_IDEA: "Course Name:\nC",
    });
    assert.match(composed ?? "", /HIDDEN_GEMS:/);
    assert.match(composed ?? "", /SUBSTACK_NOTE:/);
    assert.match(composed ?? "", /SKOOL_POST:/);
    assert.match(composed ?? "", /SKOOL_COURSE_IDEA:/);
  });

  it("5) historical Executive Versions without new assets still render safely", () => {
    const legacy = labeledRequiredBlock();
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(legacy), {
      prospectMode: true,
    });
    assert.ok(assets.length >= 14);
    for (const key of NEW_V7_INTERACTION_TYPES) {
      assert.equal(
        assets.some((asset) => asset.assetKey === key),
        false,
      );
    }
    assert.doesNotThrow(() =>
      buildDiscussionDeploymentAssets(stubAnalysis(legacy), {
        prospectMode: true,
      }),
    );
  });

  it("6) Discussion generation is unchanged (excludes Prospect-only V7 assets)", () => {
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: false,
    });
    for (const key of NEW_V7_KEYS) {
      assert.doesNotMatch(block, new RegExp(key));
    }
  });

  it("7) publication does not complete with an invalid partial required asset set", () => {
    const missingOne = labeledRequiredBlock(
      REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.slice(0, 13),
    );
    const parsed = extractProspectDeploymentAssetKeys(missingOne);
    assert.equal(isCompleteProspectDeploymentAssetSet(parsed), false);
    assert.equal(unwrapProspectDeploymentAssetResponse(missingOne).isComplete, false);

    // New optional assets alone cannot satisfy publication.
    const onlyNew = NEW_V7_KEYS.map((key) => `${key}:\nbody`).join("\n\n");
    assert.equal(unwrapProspectDeploymentAssetResponse(onlyNew).isComplete, false);

    // Required-complete set remains publishable even without the new optionals.
    const onlyRequired = labeledRequiredBlock();
    assert.equal(unwrapProspectDeploymentAssetResponse(onlyRequired).isComplete, true);
    for (const key of NEW_V7_KEYS) {
      assert.ok(
        !(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(
          key,
        ),
      );
    }
  });
});

describe("V7 Prospect Deployment Assets — UI contracts (copy, tags, reload)", () => {
  it("8) navigation/reload does not trigger generation (no client regenerate on asset parse)", () => {
    const workspace = readFileSync(
      join(ROOT, "components/discussions/ExecutiveIntelligenceWorkspace.tsx"),
      "utf8",
    );
    assert.match(workspace, /buildDiscussionDeploymentAssets/);
    assert.doesNotThrow(() =>
      buildDiscussionDeploymentAssets(
        stubAnalysis(`${labeledRequiredBlock()}\n\nSUBSTACK_NOTE:\nHello`),
        { prospectMode: true },
      ),
    );
    // Asset display is parse-only; generation remains worker-bound.
    const deploymentWorkflow = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );
    assert.match(deploymentWorkflow, /generateReview/);
    assert.doesNotMatch(workspace, /generateDeploymentAssets\(/);
  });

  it("9+10) copy and usage tags support all four new interaction keys", () => {
    for (const key of NEW_V7_INTERACTION_TYPES) {
      assert.equal(isSupportedAssetInteractionType(key), true);
    }
  });

  it("11) tenant isolation remains org-scoped on asset interactions", () => {
    const route = readFileSync(
      join(ROOT, "app/api/asset-interactions/route.ts"),
      "utf8",
    );
    assert.match(route, /organization_id|organizationId|getOrganizationContext|requireOrganization/i);
  });
});

describe("V7 Hidden Gems — website intelligence grounding", () => {
  it("12) Hidden Gems prompt requires complete learned website context", () => {
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /COMPLETE website intelligence/i);
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /deep-scrape|multi-page corpus/i);
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /Finding/);
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /Why it matters/);
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /Opportunity/);
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /Do not invent facts/i);

    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /website_intelligence/);
    assert.match(assembly, /business_knowledge/);
    assert.match(assembly, /pages_analyzed/);
    assert.match(assembly, /HIDDEN_GEMS_GENERATION_RULES/);
  });

  it("13+14) homepage-only and deep-scrape share one generation path (no crawler changes)", () => {
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /homepage-level intelligence/i);
    assert.match(HIDDEN_GEMS_GENERATION_RULES, /deep-scrape/i);
    assert.match(
      HIDDEN_GEMS_GENERATION_RULES,
      /When the corpus is limited, produce fewer findings/i,
    );

    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    // Same website_intelligence injection used by Knowledge Base / other assets.
    assert.match(assembly, /deepWebsiteIntelligence/);
    assert.match(assembly, /HIDDEN_GEMS_GENERATION_RULES/);
    assert.doesNotMatch(assembly, /hidden_gems_crawl|runHiddenGemsCrawl/);
  });
});

describe("V7 Prospect Deployment Assets — content contracts and canonicalize", () => {
  it("content rules match product expectations", () => {
    assert.match(SUBSTACK_NOTE_GENERATION_RULES, /ready-to-publish Substack Note/i);
    assert.match(SUBSTACK_NOTE_GENERATION_RULES, /NOT a full newsletter/i);
    assert.match(SUBSTACK_NOTE_GENERATION_RULES, /Output ONLY the final post copy/i);

    assert.match(SKOOL_POST_GENERATION_RULES, /Title:/);
    assert.match(SKOOL_POST_GENERATION_RULES, /Post:/);
    assert.match(SKOOL_POST_GENERATION_RULES, /General Discussion/i);

    assert.match(SKOOL_COURSE_IDEA_GENERATION_RULES, /Course Name:/);
    assert.match(SKOOL_COURSE_IDEA_GENERATION_RULES, /Recommended Modules:/);
    assert.match(SKOOL_COURSE_IDEA_GENERATION_RULES, /Practical Outcome:/);
    assert.match(SKOOL_COURSE_IDEA_GENERATION_RULES, /Do not invent credentials/i);
  });

  it("canonical heading variants normalize for all four assets", () => {
    const text = canonicalizeDeploymentAssetHeadings(`
Hidden Gems:
- **Finding:** x

Substack Note:
A short insight.

Skool Post:
Title:
Hello

Skool Course Idea:
Course Name:
Sprint
`);
    assert.match(text, /HIDDEN_GEMS:/);
    assert.match(text, /SUBSTACK_NOTE:/);
    assert.match(text, /SKOOL_POST:/);
    assert.match(text, /SKOOL_COURSE_IDEA:/);

    const assets = parseLabeledDeploymentAssets(text);
    assert.deepEqual(
      assets.map((asset) => asset.assetKey).sort(),
      [...NEW_V7_INTERACTION_TYPES].sort(),
    );
  });
});
