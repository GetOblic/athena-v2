import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildDiscussionDeploymentAssets,
  canonicalizeDeploymentAssetHeadings,
} from "../../lib/deploymentAssets";
import {
  resolveDeploymentAssetsStage,
  resolveModelForStage,
} from "../../lib/llm/modelRouting";
import {
  canonicalDeploymentAssetType,
  isSupportedAssetInteractionType,
} from "../../services/assetInteractions/assetInteractionKeys";
import {
  PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_META,
} from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import { KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES } from "../../services/ai/prompts/knowledgeBaseEnhancementConstraints";
import { SUBSTACK_POST_GENERATION_RULES } from "../../services/ai/prompts/substackPostConstraints";
import { REDDIT_POST_GENERATION_RULES } from "../../services/ai/prompts/redditPostConstraints";
import { DEPLOYMENT_SECTION_LABELS } from "../../services/ai/prompts/sharedPromptConstraints";
import { composeSuggestedCtaFromRawAssetObject } from "../../services/executiveVersions/executiveVersionDisplay";

const ROOT = process.cwd();

function stubAnalysis(suggestedCta: string | null) {
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

const FULL_PROSPECT = `
PERSONALIZED_OUTREACH_EMAIL:
Hello there

FOLLOW_UP_EMAIL:
Following up

WHATSAPP_OUTREACH:
INITIAL MESSAGE
Hi on WhatsApp

FOLLOW-UP
Quick bump

NEWSLETTER_IDEA:
Subject: Ops tips

BLOG_POST_IDEA:
Title: Clinic operations guide

KNOWLEDGE_BASE_ENHANCEMENT:
## Business Overview
- Aesthetic clinic in Austin

## Services and Products
### Botox
- Overview: Neuromodulator treatment

SUBSTACK_POST:
TITLE
Why clinics lose patients at intake

SUBTITLE
A quieter operational problem

POST
Most clinics optimize marketing before operations.

CLOSING CTA
Reply if you want the checklist.

REDDIT_POST:
SUGGESTED TITLE
How do aesthetic clinics handle aftercare questions?

POST
I work in this space, and one issue I keep seeing is inconsistent aftercare answers.

OPTIONAL DISCUSSION QUESTION
What scripts have worked for your front desk?
`.trim();

describe("Sprint 2B — Prospect knowledge assets registry", () => {
  it("registers three stable canonical Prospect keys", () => {
    assert.ok(
      PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("KNOWLEDGE_BASE_ENHANCEMENT"),
    );
    assert.ok(PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("SUBSTACK_POST"));
    assert.ok(PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("REDDIT_POST"));
    assert.equal(
      canonicalDeploymentAssetType("KNOWLEDGE_BASE_ENHANCEMENT"),
      "knowledge_base_enhancement",
    );
    assert.equal(canonicalDeploymentAssetType("SUBSTACK_POST"), "substack_post");
    assert.equal(canonicalDeploymentAssetType("REDDIT_POST"), "reddit_post");
  });

  it("does not register them as Discussion labels", () => {
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /KNOWLEDGE_BASE_ENHANCEMENT/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SUBSTACK_POST/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /REDDIT_POST/);
  });

  it("Copy/Done accepts the three keys", () => {
    assert.equal(isSupportedAssetInteractionType("knowledge_base_enhancement"), true);
    assert.equal(isSupportedAssetInteractionType("substack_post"), true);
    assert.equal(isSupportedAssetInteractionType("reddit_post"), true);
  });

  it("exposes display titles", () => {
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.KNOWLEDGE_BASE_ENHANCEMENT.title,
      "Knowledge Base Enhancement",
    );
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.SUBSTACK_POST.title, "Substack Post");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.REDDIT_POST.title, "Reddit Post");
  });
});

describe("Sprint 2B — Athena routing policy", () => {
  it("Discussion Analysis uses Gemini", () => {
    const route = resolveModelForStage("discussion_analysis");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Discussion Executive Briefing uses Gemini", () => {
    const route = resolveModelForStage("executive_briefing");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Discussion Deployment Assets use Gemini", () => {
    const stage = resolveDeploymentAssetsStage({ isProspectSource: false });
    assert.equal(stage, "deployment_assets");
    const route = resolveModelForStage(stage);
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Discussion Strategic Blueprint uses Claude", () => {
    const route = resolveModelForStage("strategic_blueprint");
    assert.equal(route.role, "premiumStrategicOutput");
    assert.match(route.model, /claude/i);
  });

  it("Prospect Analysis uses Gemini", () => {
    const route = resolveModelForStage("discussion_analysis");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Prospect Executive Briefing uses Gemini", () => {
    const route = resolveModelForStage("executive_briefing");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("all Prospect Deployment Assets use Gemini via prospect_deployment_assets", () => {
    const stage = resolveDeploymentAssetsStage({ isProspectSource: true });
    assert.equal(stage, "prospect_deployment_assets");
    const route = resolveModelForStage(stage);
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Prospect Strategic Blueprint uses Claude", () => {
    const route = resolveModelForStage("strategic_blueprint");
    assert.equal(route.role, "premiumStrategicOutput");
    assert.match(route.model, /claude/i);
  });

  it("workflow uses one Gemini call per source — no merge layer", () => {
    const workflow = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );
    assert.match(workflow, /resolveDeploymentAssetsStage/);
    assert.match(workflow, /prospect_deployment_assets/);
    assert.match(workflow, /reasoningProfile:\s*"EXECUTIVE"/);
    assert.equal((workflow.match(/await generateReview\(/g) ?? []).length, 1);
    assert.doesNotMatch(workflow, /mergeProspectContent|prospect_content_assets/);
    assert.doesNotMatch(
      workflow,
      /generateProspectContentAssetsSafely/,
    );
  });

  it("Discussion prompt content is unchanged aside from model routing", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    // Discussion JSON examples use COMMUNITY_REPLY…BLOG_POST_IDEA only.
    const discussionExamples = [
      ...assembly.matchAll(/"suggested_cta": "COMMUNITY_REPLY:\\\\n[\s\S]*?"/g),
    ].map((m) => m[0]);
    assert.ok(discussionExamples.length >= 1);
    for (const example of discussionExamples) {
      assert.doesNotMatch(
        example,
        /KNOWLEDGE_BASE_ENHANCEMENT|SUBSTACK_POST|REDDIT_POST|PERSONALIZED_OUTREACH/,
      );
      assert.match(example, /COMMUNITY_REPLY/);
      assert.match(example, /BLOG_POST_IDEA/);
    }
  });
});

describe("Sprint 2B — prompt contracts", () => {
  it("Prospect Gemini prompt requests existing assets plus the three new ones", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /PERSONALIZED_OUTREACH_EMAIL/);
    assert.match(assembly, /WHATSAPP_OUTREACH/);
    assert.match(assembly, /KNOWLEDGE_BASE_ENHANCEMENT/);
    assert.match(assembly, /SUBSTACK_POST/);
    assert.match(assembly, /REDDIT_POST/);
    assert.match(assembly, /KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES/);
    assert.match(assembly, /SUBSTACK_POST_GENERATION_RULES/);
    assert.match(assembly, /REDDIT_POST_GENERATION_RULES/);
  });

  it("Discussion prompt remains free of Prospect-only labels", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    const discussionSlice = assembly.slice(
      assembly.indexOf("COMMUNITY_REPLY:\\\\n"),
    );
    assert.doesNotMatch(
      discussionSlice.slice(0, 800),
      /KNOWLEDGE_BASE_ENHANCEMENT|SUBSTACK_POST|REDDIT_POST/,
    );
  });

  it("Knowledge Base forbids invention", () => {
    assert.match(KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES, /Never invent/i);
    assert.match(KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES, /Omit unknown/i);
  });

  it("Substack requires publication-ready long-form", () => {
    assert.match(SUBSTACK_POST_GENERATION_RULES, /publication-ready|long-form/i);
    assert.match(SUBSTACK_POST_GENERATION_RULES, /NOT SEO/i);
  });

  it("Reddit forbids astroturfing", () => {
    assert.match(REDDIT_POST_GENERATION_RULES, /astroturfing/i);
    assert.match(REDDIT_POST_GENERATION_RULES, /real Reddit user/i);
  });
});

describe("Sprint 2B — parser and versioning", () => {
  it("parses all existing and new assets together", () => {
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(FULL_PROSPECT));
    const keys = assets.map((a) => a.assetKey);
    assert.ok(keys.includes("email_outreach"));
    assert.ok(keys.includes("whatsapp_outreach"));
    assert.ok(keys.includes("knowledge_base_enhancement"));
    assert.ok(keys.includes("substack_post"));
    assert.ok(keys.includes("reddit_post"));
  });

  it("heading variants canonicalize", () => {
    const text = canonicalizeDeploymentAssetHeadings(`
Knowledge Base Enhancement:
Facts

SUBSTACK POST:
TITLE
Hello

Reddit Post:
SUGGESTED TITLE
Q
`);
    assert.match(text, /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(text, /SUBSTACK_POST:/);
    assert.match(text, /REDDIT_POST:/);
  });

  it("missing new assets do not hide existing assets", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`
PERSONALIZED_OUTREACH_EMAIL:
Hello

WHATSAPP_OUTREACH:
INITIAL MESSAGE
Hi
`),
    );
    const keys = assets.map((a) => a.assetKey);
    assert.ok(keys.includes("email_outreach"));
    assert.ok(keys.includes("whatsapp_outreach"));
    assert.ok(!keys.includes("substack_post"));
  });

  it("WhatsApp stays separate from Email", () => {
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(FULL_PROSPECT));
    const byKey = Object.fromEntries(assets.map((a) => [a.assetKey, a.content]));
    assert.ok(!byKey.email_outreach.includes("WhatsApp"));
    assert.match(byKey.whatsapp_outreach, /INITIAL MESSAGE/);
  });

  it("Reddit stays separate from Blog Post Idea", () => {
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(FULL_PROSPECT));
    const byKey = Object.fromEntries(assets.map((a) => [a.assetKey, a.content]));
    assert.ok(!byKey.blog_post_idea.includes("I work in this space"));
    assert.match(byKey.reddit_post, /I work in this space/);
  });

  it("Substack stays separate from Newsletter and Blog", () => {
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(FULL_PROSPECT));
    const byKey = Object.fromEntries(assets.map((a) => [a.assetKey, a.content]));
    assert.ok(!byKey.newsletter_idea.includes("CLOSING CTA"));
    assert.match(byKey.substack_post, /CLOSING CTA|intake/i);
  });

  it("raw JSON recovery includes the three keys and WhatsApp", () => {
    const composed = composeSuggestedCtaFromRawAssetObject({
      PERSONALIZED_OUTREACH_EMAIL: "Hello",
      WHATSAPP_OUTREACH: "INITIAL MESSAGE\nHi",
      KNOWLEDGE_BASE_ENHANCEMENT: "## Business Overview\n- Clinic",
      SUBSTACK_POST: "TITLE\nArticle",
      REDDIT_POST: "SUGGESTED TITLE\nPost",
    });
    assert.match(composed ?? "", /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(composed ?? "", /SUBSTACK_POST:/);
    assert.match(composed ?? "", /REDDIT_POST:/);
    assert.match(composed ?? "", /WHATSAPP_OUTREACH:/);
  });

  it("Discussion parsing unchanged", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`
COMMUNITY_REPLY:
Public

PRIVATE_MESSAGE:
DM

SOCIAL_POST:
Social
`),
    );
    assert.deepEqual(
      assets.map((a) => a.assetKey),
      ["community_reply", "private_message", "social_post"],
    );
  });
});

describe("Sprint 2B — regression", () => {
  it("does not restore Sprint 2B crawler modules", () => {
    for (const file of [
      "prospectWebsiteDiscovery.ts",
      "prospectWebsiteExtraction.ts",
      "prospectWebsiteKnowledgeMerge.ts",
      "prospectWebsiteRanking.ts",
      "prospectWebsiteUrl.ts",
      "prospectWebsiteLearningPolicy.ts",
      "prospectDeploymentAssetContract.ts",
      "prospectGenerationDiagnostics.ts",
    ]) {
      try {
        readFileSync(join(ROOT, "services/prospects", file), "utf8");
        assert.fail(`forbidden file restored: ${file}`);
      } catch (error) {
        assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
      }
    }
  });

  it("no completeness gate", () => {
    try {
      readFileSync(
        join(ROOT, "services/prospects/prospectDeploymentAssetContract.ts"),
        "utf8",
      );
      assert.fail("must not exist");
    } catch (error) {
      assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("Blueprint service stays on strategic_blueprint", () => {
    const source = readFileSync(
      join(ROOT, "services/assetBlueprints/assetBlueprintService.ts"),
      "utf8",
    );
    assert.match(source, /athenaStage:\s*"strategic_blueprint"/);
    assert.doesNotMatch(source, /prospect_deployment_assets/);
  });

  it("publication, polling, worker, and core versioning remain untouched by this sprint", () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const protectedPaths = [
      "workers/athenaWorker.ts",
      "services/generationJobs/generationJobService.ts",
      "services/generationJobs/generationJobExecutor.ts",
      "services/generationJobs/generationJobWorkerConfig.ts",
      "services/executiveVersions/executiveVersionService.ts",
      "services/executiveVersions/executiveVersionMetadata.ts",
      "lib/discussionRegenerationInFlight.ts",
    ];
    const changed = execSync("git diff HEAD --name-only", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const path of protectedPaths) {
      assert.ok(
        !changed.includes(path),
        `protected file unexpectedly modified: ${path}`,
      );
    }
  });

  it("three new assets remain Prospect-only in Discussion section labels", () => {
    assert.doesNotMatch(
      DEPLOYMENT_SECTION_LABELS,
      /KNOWLEDGE_BASE_ENHANCEMENT|SUBSTACK_POST|REDDIT_POST/,
    );
    assert.ok(
      PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("KNOWLEDGE_BASE_ENHANCEMENT"),
    );
    assert.ok(PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("SUBSTACK_POST"));
    assert.ok(PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("REDDIT_POST"));
  });
});
