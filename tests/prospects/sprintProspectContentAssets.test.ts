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
  resolveRoleForStage,
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

const CORE_OUTREACH = `
PERSONALIZED_OUTREACH_EMAIL:
Hello there

FOLLOW_UP_EMAIL:
Following up

WHATSAPP_OUTREACH:
INITIAL MESSAGE
Hi on WhatsApp

FOLLOW-UP
Quick bump

BLOG_POST_IDEA:
Title: Clinic operations guide
`.trim();

const KNOWLEDGE = `
KNOWLEDGE_BASE_ENHANCEMENT:
## Business Overview
- Aesthetic clinic in Austin

## Services and Products
### Botox
- Overview: Neuromodulator treatment
`.trim();

const SUBSTACK = `
SUBSTACK_POST:
TITLE
Why clinics lose patients at intake

SUBTITLE
A quieter operational problem

POST
Most clinics optimize marketing before operations.

CLOSING CTA
Reply if you want the checklist.
`.trim();

const REDDIT = `
REDDIT_POST:
SUGGESTED TITLE
How do aesthetic clinics handle aftercare questions?

POST
I work in this space, and one issue I keep seeing is inconsistent aftercare answers.

OPTIONAL DISCUSSION QUESTION
What scripts have worked for your front desk?
`.trim();

describe("Prospect content assets — registry", () => {
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

  it("does not register the three assets as Discussion labels", () => {
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /KNOWLEDGE_BASE_ENHANCEMENT/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SUBSTACK_POST/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /REDDIT_POST/);
  });

  it("accepts the three keys for Copy/Done validation", () => {
    assert.equal(
      isSupportedAssetInteractionType("knowledge_base_enhancement"),
      true,
    );
    assert.equal(isSupportedAssetInteractionType("substack_post"), true);
    assert.equal(isSupportedAssetInteractionType("reddit_post"), true);
  });

  it("exposes display titles and descriptions", () => {
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.KNOWLEDGE_BASE_ENHANCEMENT.title,
      "Knowledge Base Enhancement",
    );
    assert.match(
      PROSPECT_DEPLOYMENT_ASSET_META.KNOWLEDGE_BASE_ENHANCEMENT.objective,
      /voice AI/i,
    );
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.SUBSTACK_POST.title,
      "Substack Post",
    );
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.REDDIT_POST.title, "Reddit Post");
  });
});

describe("Prospect model routing — Gemini for analysis/assets, Claude for Blueprint", () => {
  it("Prospect analysis uses Gemini", () => {
    const route = resolveModelForStage("discussion_analysis");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Prospect Executive Briefing uses Gemini", () => {
    const route = resolveModelForStage("executive_briefing");
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Prospect Deployment Assets use Gemini", () => {
    const stage = resolveDeploymentAssetsStage({ isProspectSource: true });
    assert.equal(stage, "prospect_deployment_assets");
    const route = resolveModelForStage(stage);
    assert.equal(route.role, "analysis");
    assert.match(route.model, /gemini/i);
  });

  it("Email, WhatsApp, Knowledge Base, Substack, and Reddit share Prospect Gemini stage", () => {
    const route = resolveModelForStage("prospect_deployment_assets");
    assert.equal(resolveRoleForStage("prospect_deployment_assets"), "analysis");
    assert.match(route.model, /gemini/i);
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
  });

  it("Prospect Strategic Blueprint uses Claude", () => {
    const route = resolveModelForStage("strategic_blueprint");
    assert.equal(route.role, "premiumStrategicOutput");
    assert.match(route.model, /claude/i);
  });

  it("Blueprint service remains on strategic_blueprint Claude stage", () => {
    const blueprint = readFileSync(
      join(ROOT, "services/assetBlueprints/assetBlueprintService.ts"),
      "utf8",
    );
    assert.match(blueprint, /athenaStage:\s*"strategic_blueprint"/);
    assert.doesNotMatch(blueprint, /prospect_deployment_assets/);
  });
});

describe("Discussion isolation", () => {
  it("Discussion analysis routing remains Gemini analysis", () => {
    assert.equal(resolveModelForStage("discussion_analysis").role, "analysis");
  });

  it("Discussion Deployment Asset routing remains Claude premium", () => {
    const stage = resolveDeploymentAssetsStage({ isProspectSource: false });
    assert.equal(stage, "deployment_assets");
    const route = resolveModelForStage(stage);
    assert.equal(route.role, "premiumStrategicOutput");
    assert.match(route.model, /claude/i);
  });

  it("Discussion Strategic Blueprint routing remains Claude", () => {
    assert.equal(
      resolveModelForStage("strategic_blueprint").role,
      "premiumStrategicOutput",
    );
  });

  it("workflow selects Prospect vs Discussion deployment stage by bridge platform", () => {
    const workflow = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );
    assert.match(workflow, /resolveDeploymentAssetsStage/);
    assert.match(workflow, /PROSPECT_INTELLIGENCE_PLATFORM/);
    assert.match(workflow, /prospect_deployment_assets/);
    assert.doesNotMatch(workflow, /generateProspectContentAssetsSafely/);
    assert.doesNotMatch(workflow, /mergeProspectContentAssets/);
    assert.doesNotMatch(workflow, /prospect_content_assets/);
  });
});

describe("Prospect content assets — prompt contracts", () => {
  it("canonical Prospect Gemini Deployment Asset prompt requests all current Prospect assets", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /PERSONALIZED_OUTREACH_EMAIL/);
    assert.match(assembly, /WHATSAPP_OUTREACH/);
    assert.match(assembly, /NEWSLETTER_IDEA/);
    assert.match(assembly, /BLOG_POST_IDEA/);
    assert.match(assembly, /KNOWLEDGE_BASE_ENHANCEMENT/);
    assert.match(assembly, /SUBSTACK_POST/);
    assert.match(assembly, /REDDIT_POST/);
  });

  it("includes Knowledge Base, Substack, and Reddit constraints", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES/);
    assert.match(assembly, /SUBSTACK_POST_GENERATION_RULES/);
    assert.match(assembly, /REDDIT_POST_GENERATION_RULES/);
  });

  it("no Prospect Deployment Asset is requested in the Claude Blueprint prompt", () => {
    const blueprintAssembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/generationPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(blueprintAssembly, /KNOWLEDGE_BASE_ENHANCEMENT/);
    assert.doesNotMatch(blueprintAssembly, /SUBSTACK_POST/);
    assert.doesNotMatch(blueprintAssembly, /REDDIT_POST/);
    assert.doesNotMatch(blueprintAssembly, /WHATSAPP_OUTREACH/);
  });

  it("temporary split-provider merge is removed", () => {
    try {
      readFileSync(
        join(ROOT, "services/workflows/prospectContentAssetsMerge.ts"),
        "utf8",
      );
      assert.fail("merge file must be removed");
    } catch (error) {
      assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
    }
    try {
      readFileSync(
        join(
          ROOT,
          "services/brain/generationContracts/prospectContentAssetsPromptAssembly.ts",
        ),
        "utf8",
      );
      assert.fail("split Gemini prompt assembly must be removed");
    } catch (error) {
      assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("Discussion prompt remains unchanged (no new Prospect labels)", () => {
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

  it("Knowledge Base contract forbids unsupported invention", () => {
    assert.match(KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES, /Do not invent/i);
    assert.match(KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES, /Do not scrape/i);
  });

  it("Substack contract requires publication-ready long-form output", () => {
    assert.match(SUBSTACK_POST_GENERATION_RULES, /publication-ready/i);
    assert.match(SUBSTACK_POST_GENERATION_RULES, /700–1,300|700-1,300/);
  });

  it("Reddit contract forbids fake customer or astroturfing language", () => {
    assert.match(REDDIT_POST_GENERATION_RULES, /astroturfing/i);
    assert.match(REDDIT_POST_GENERATION_RULES, /unaffiliated customer/i);
  });
});

describe("Prospect content assets — parser", () => {
  it("parses all existing and new Prospect assets together", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`${CORE_OUTREACH}\n\n${KNOWLEDGE}\n\n${SUBSTACK}\n\n${REDDIT}`),
    );
    const keys = assets.map((asset) => asset.assetKey);
    assert.ok(keys.includes("email_outreach"));
    assert.ok(keys.includes("whatsapp_outreach"));
    assert.ok(keys.includes("blog_post_idea"));
    assert.ok(keys.includes("knowledge_base_enhancement"));
    assert.ok(keys.includes("substack_post"));
    assert.ok(keys.includes("reddit_post"));
  });

  it("parses supported heading variants", () => {
    const variants = canonicalizeDeploymentAssetHeadings(`
Knowledge Base Enhancement:
Overview facts

SUBSTACK POST:
TITLE
Hello

Reddit Post:
SUGGESTED TITLE
Question
`);
    assert.match(variants, /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(variants, /SUBSTACK_POST:/);
    assert.match(variants, /REDDIT_POST:/);
  });

  it("missing new assets do not hide old assets", () => {
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(CORE_OUTREACH));
    const keys = assets.map((asset) => asset.assetKey);
    assert.ok(keys.includes("email_outreach"));
    assert.ok(keys.includes("whatsapp_outreach"));
    assert.ok(!keys.includes("substack_post"));
  });

  it("WhatsApp remains separate from Email", () => {
    const assets = buildDiscussionDeploymentAssets(stubAnalysis(CORE_OUTREACH));
    const byKey = Object.fromEntries(
      assets.map((asset) => [asset.assetKey, asset.content]),
    );
    assert.match(byKey.email_outreach, /Hello there/);
    assert.ok(!byKey.email_outreach.includes("WhatsApp"));
    assert.match(byKey.whatsapp_outreach, /INITIAL MESSAGE/);
  });

  it("Reddit remains separate from Blog Post Idea", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`
BLOG_POST_IDEA:
Title: Operations outline

REDDIT_POST:
SUGGESTED TITLE
Ops question

POST
I work in this space...
`),
    );
    const byKey = Object.fromEntries(
      assets.map((asset) => [asset.assetKey, asset.content]),
    );
    assert.ok(!byKey.blog_post_idea.includes("I work in this space"));
    assert.match(byKey.reddit_post, /I work in this space/);
  });

  it("Substack remains separate from Newsletter and Blog", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`
NEWSLETTER_IDEA:
Subject: Ops tips

BLOG_POST_IDEA:
Title: Outline only

${SUBSTACK}
`),
    );
    const byKey = Object.fromEntries(
      assets.map((asset) => [asset.assetKey, asset.content]),
    );
    assert.ok(!byKey.newsletter_idea.includes("CLOSING CTA"));
    assert.ok(!byKey.blog_post_idea.includes("CLOSING CTA"));
    assert.match(byKey.substack_post, /CLOSING CTA|intake/i);
  });

  it("malformed Knowledge Base section does not consume Substack or Reddit", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`
PERSONALIZED_OUTREACH_EMAIL:
Hello

KNOWLEDGE_BASE_ENHANCEMENT:
## Broken section without required structure
partial facts only

SUBSTACK_POST:
TITLE
Keep me

POST
Body stays with Substack

REDDIT_POST:
SUGGESTED TITLE
Keep Reddit

POST
Reddit body
`),
    );
    const byKey = Object.fromEntries(
      assets.map((asset) => [asset.assetKey, asset.content]),
    );
    assert.match(byKey.knowledge_base_enhancement, /Broken section/);
    assert.match(byKey.substack_post, /Keep me/);
    assert.match(byKey.reddit_post, /Keep Reddit/);
    assert.ok(!byKey.knowledge_base_enhancement.includes("Keep me"));
  });

  it("Discussion parsing remains unchanged", () => {
    const assets = buildDiscussionDeploymentAssets(
      stubAnalysis(`
COMMUNITY_REPLY:
Public reply

PRIVATE_MESSAGE:
DM text

SOCIAL_POST:
Social copy
`),
    );
    assert.deepEqual(
      assets.map((asset) => asset.assetKey),
      ["community_reply", "private_message", "social_post"],
    );
  });
});

describe("Prospect content assets — versioning and Copy/Done", () => {
  it("Current/Historical raw object recovery includes the three keys", () => {
    const composed = composeSuggestedCtaFromRawAssetObject({
      PERSONALIZED_OUTREACH_EMAIL: "Hello",
      KNOWLEDGE_BASE_ENHANCEMENT: "## Business Overview\n- Clinic",
      SUBSTACK_POST: "TITLE\nArticle",
      REDDIT_POST: "SUGGESTED TITLE\nPost",
      WHATSAPP_OUTREACH: "INITIAL MESSAGE\nHi",
    });
    assert.ok(composed);
    assert.match(composed ?? "", /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(composed ?? "", /SUBSTACK_POST:/);
    assert.match(composed ?? "", /REDDIT_POST:/);
  });

  it("each new asset has an independent canonical key", () => {
    assert.notEqual(
      canonicalDeploymentAssetType("KNOWLEDGE_BASE_ENHANCEMENT"),
      canonicalDeploymentAssetType("SUBSTACK_POST"),
    );
  });
});

describe("Prospect content assets — regression guards", () => {
  it("does not restore Sprint 2B crawler modules", () => {
    const forbidden = [
      "prospectWebsiteDiscovery.ts",
      "prospectWebsiteExtraction.ts",
      "prospectWebsiteKnowledgeMerge.ts",
      "prospectWebsiteRanking.ts",
      "prospectWebsiteUrl.ts",
      "prospectWebsiteLearningPolicy.ts",
      "prospectDeploymentAssetContract.ts",
      "prospectGenerationDiagnostics.ts",
    ];
    for (const file of forbidden) {
      try {
        readFileSync(join(ROOT, "services/prospects", file), "utf8");
        assert.fail(`forbidden crawler/repair file restored: ${file}`);
      } catch (error) {
        assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
      }
    }
  });

  it("no completeness gate is introduced", () => {
    try {
      readFileSync(
        join(ROOT, "services/prospects/prospectDeploymentAssetContract.ts"),
        "utf8",
      );
      assert.fail("completeness contract file must not exist");
    } catch (error) {
      assert.equal((error as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("Refresh Intelligence path remains free of website discovery", () => {
    const refresh = readFileSync(
      join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    assert.match(refresh, /manual_refresh/);
    assert.doesNotMatch(refresh, /scrapeHomepage|WebsiteDiscovery|multiPage/);
  });

  it("homepage intelligence remains homepage-only", () => {
    const website = readFileSync(
      join(ROOT, "services/prospects/prospectWebsiteIntelligence.ts"),
      "utf8",
    );
    assert.doesNotMatch(website, /rankAndSelectPages|discoverHighValuePages/);
  });

  it("no publication/polling/worker-lease changes for this routing correction", () => {
    // Routing-only: status/polling files must not reference prospect content merge.
    const statusLib = readFileSync(
      join(ROOT, "lib/discussionRegenerationStatus.ts"),
      "utf8",
    );
    assert.doesNotMatch(statusLib, /prospect_content_assets|prospect_deployment_assets/);
  });
});
