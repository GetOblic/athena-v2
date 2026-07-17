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
import { KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES } from "../../services/ai/prompts/knowledgeBaseEnhancementConstraints";
import {
  OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_META,
} from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import { REDDIT_POST_GENERATION_RULES } from "../../services/ai/prompts/redditPostConstraints";
import { SOCIAL_VOICE_POST_GENERATION_RULES } from "../../services/ai/prompts/socialVoicePostConstraints";
import { DEPLOYMENT_SECTION_LABELS } from "../../services/ai/prompts/sharedPromptConstraints";
import { SUBSTACK_POST_GENERATION_RULES } from "../../services/ai/prompts/substackPostConstraints";
import { WHATSAPP_OUTREACH_GENERATION_RULES } from "../../services/ai/prompts/whatsappOutreachConstraints";
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

const OPTIONAL = [
  "WHATSAPP_OUTREACH",
  "KNOWLEDGE_BASE_ENHANCEMENT",
  "HIDDEN_GEMS",
  "SUBSTACK_POST",
  "SUBSTACK_NOTE",
  "REDDIT_POST",
  "SKOOL_POST",
  "SKOOL_COURSE_IDEA",
  "SOCIAL_VOICE_POST",
  "SHORT_VIDEO_PROMPT",
  "VISUAL_MESSAGE_PROMPT",
  "LOCAL_OUTREACH_IMAGE_PROMPT",
] as const;

function labeledRequiredBlock(
  keys: readonly string[] = REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  body = "Content for this channel.",
): string {
  return keys.map((key) => `${key}:\n${body}`).join("\n\n");
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

describe("Prospect optional content assets — registry and prompt", () => {
  it("registers all Prospect optional assets including Social Voice Post", () => {
    assert.deepEqual([...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS], [...OPTIONAL]);
    for (const key of OPTIONAL) {
      assert.ok(PROSPECT_DEPLOYMENT_ASSET_KEYS.includes(key));
    }
    assert.equal(
      canonicalDeploymentAssetType("WHATSAPP_OUTREACH"),
      "whatsapp_outreach",
    );
    assert.equal(
      canonicalDeploymentAssetType("KNOWLEDGE_BASE_ENHANCEMENT"),
      "knowledge_base_enhancement",
    );
    assert.equal(canonicalDeploymentAssetType("SUBSTACK_POST"), "substack_post");
    assert.equal(canonicalDeploymentAssetType("SUBSTACK_NOTE"), "substack_note");
    assert.equal(canonicalDeploymentAssetType("HIDDEN_GEMS"), "hidden_gems");
    assert.equal(canonicalDeploymentAssetType("REDDIT_POST"), "reddit_post");
    assert.equal(canonicalDeploymentAssetType("SKOOL_POST"), "skool_post");
    assert.equal(
      canonicalDeploymentAssetType("SKOOL_COURSE_IDEA"),
      "skool_course_idea",
    );
    assert.equal(
      canonicalDeploymentAssetType("SOCIAL_VOICE_POST"),
      "social_voice_post",
    );
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.WHATSAPP_OUTREACH.title,
      "WhatsApp Outreach",
    );
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.KNOWLEDGE_BASE_ENHANCEMENT.title,
      "Knowledge Base Enhancement",
    );
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.HIDDEN_GEMS.title, "Hidden Gems");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.SUBSTACK_POST.title, "Substack Post");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.SUBSTACK_NOTE.title, "Substack Note");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.REDDIT_POST.title, "Reddit Post");
    assert.equal(PROSPECT_DEPLOYMENT_ASSET_META.SKOOL_POST.title, "Skool Post");
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.SKOOL_COURSE_IDEA.title,
      "Skool Course Idea",
    );
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.SOCIAL_VOICE_POST.title,
      "Social Voice Post",
    );
  });

  it("Prospect required-output requests all always-generate assets", () => {
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    for (const key of OPTIONAL) {
      assert.match(block, new RegExp(`(?:^|\\n)${key}:(?:\\n|$)`));
    }
    assert.match(block, /Generate all of these Prospect headings on every Prospect run/);
    assert.match(block, /Always generate these additional Prospect headings as well/);
    assert.doesNotMatch(block, /"suggested_cta"/);
    assert.doesNotMatch(block, /Return ONLY valid JSON/);
  });

  it("Discussion prompts exclude the Prospect-only assets", () => {
    const discussionBlock = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: false,
    });
    const prospectOnlyOptional = [
      "WHATSAPP_OUTREACH",
      "KNOWLEDGE_BASE_ENHANCEMENT",
      "HIDDEN_GEMS",
      "SUBSTACK_POST",
      "SUBSTACK_NOTE",
      "REDDIT_POST",
      "SKOOL_POST",
      "SKOOL_COURSE_IDEA",
      "SOCIAL_VOICE_POST",
      "LOCAL_OUTREACH_IMAGE_PROMPT",
    ] as const;
    for (const key of prospectOnlyOptional) {
      assert.doesNotMatch(discussionBlock, new RegExp(key));
    }
    // Shared visual assets are requested for Discussions too.
    assert.match(discussionBlock, /SHORT_VIDEO_PROMPT:/);
    assert.match(discussionBlock, /VISUAL_MESSAGE_PROMPT:/);
    assert.match(discussionBlock, /COMMUNITY_REPLY:/);
    assert.equal(
      discussionBlock.includes(DEPLOYMENT_SECTION_LABELS.trim()),
      true,
    );
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /WHATSAPP_OUTREACH/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /KNOWLEDGE_BASE_ENHANCEMENT/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /HIDDEN_GEMS/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SUBSTACK_POST/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SUBSTACK_NOTE/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /REDDIT_POST/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SKOOL_POST/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SKOOL_COURSE_IDEA/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /SOCIAL_VOICE_POST/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /LOCAL_OUTREACH_IMAGE_PROMPT/);

    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /WHATSAPP_OUTREACH_GENERATION_RULES/);
    assert.match(assembly, /KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES/);
    assert.match(assembly, /HIDDEN_GEMS_GENERATION_RULES/);
    assert.match(assembly, /SUBSTACK_POST_GENERATION_RULES/);
    assert.match(assembly, /SUBSTACK_NOTE_GENERATION_RULES/);
    assert.match(assembly, /REDDIT_POST_GENERATION_RULES/);
    assert.match(assembly, /SKOOL_POST_GENERATION_RULES/);
    assert.match(assembly, /SKOOL_COURSE_IDEA_GENERATION_RULES/);
    assert.match(assembly, /SOCIAL_VOICE_POST_GENERATION_RULES/);
    assert.match(assembly, /isProspectSource/);
  });

  it("historical content rules remain in prompt contracts", () => {
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /INITIAL MESSAGE/);
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /FOLLOW-UP/);
    assert.match(
      WHATSAPP_OUTREACH_GENERATION_RULES,
      /Generate even when no WhatsApp number is present/i,
    );
    assert.match(KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES, /Never invent/i);
    assert.match(KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES, /Omit unknown/i);
    assert.match(SUBSTACK_POST_GENERATION_RULES, /700–1,300|700-1,300/);
    assert.match(SUBSTACK_POST_GENERATION_RULES, /CLOSING CTA/);
    assert.match(REDDIT_POST_GENERATION_RULES, /astroturfing/i);
    assert.match(REDDIT_POST_GENERATION_RULES, /SUGGESTED TITLE/);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /first person singular/i);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /Athena Brain Voice/i);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /Prospect analysis/i);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /150–350|150-350/);
  });
});

describe("Prospect optional content assets — parser, EV, Copy/Done, completeness", () => {
  it("parser displays all Prospect optional assets including Social Voice Post", () => {
    const text = [
      labeledRequiredBlock(),
      "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nHi\n\nFOLLOW-UP\nPing",
      "KNOWLEDGE_BASE_ENHANCEMENT:\n## Business Overview\n- Clinic",
      "SUBSTACK_POST:\nTITLE\nArticle\n\nSUBTITLE\nSub\n\nPOST\nBody\n\nCLOSING CTA\nNext",
      "REDDIT_POST:\nSUGGESTED TITLE\nAsk\n\nPOST\nCommunity note",
      "SOCIAL_VOICE_POST:\nAs a CEO, I talk every day with operators facing the same bottleneck.",
    ].join("\n\n");

    const assets = buildDiscussionDeploymentAssets(stubAnalysis(text), {
      prospectMode: true,
    });
    const keys = assets.map((asset) => asset.assetKey);
    assert.ok(keys.includes("whatsapp_outreach"));
    assert.ok(keys.includes("knowledge_base_enhancement"));
    assert.ok(keys.includes("substack_post"));
    assert.ok(keys.includes("reddit_post"));
    assert.ok(keys.includes("social_voice_post"));
    assert.ok(keys.includes("email_outreach"));
    assert.equal(
      assets.find((asset) => asset.assetKey === "social_voice_post")?.title,
      "Social Voice Post",
    );
  });

  it("canonical heading variants normalize correctly", () => {
    const text = canonicalizeDeploymentAssetHeadings(`
Knowledge Base Enhancement:
facts

Substack Post:
TITLE
Post

Reddit Post:
SUGGESTED TITLE
Ask

Social Voice Post:
As an operator, I see this pattern weekly.
`);
    assert.match(text, /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(text, /SUBSTACK_POST:/);
    assert.match(text, /REDDIT_POST:/);
    assert.match(text, /SOCIAL_VOICE_POST:/);

    const assets = parseLabeledDeploymentAssets(text);
    assert.deepEqual(
      assets.map((asset) => asset.assetKey).sort(),
      [
        "knowledge_base_enhancement",
        "reddit_post",
        "social_voice_post",
        "substack_post",
      ].sort(),
    );
  });

  it("Copy / Done accepts all optional keys including social_voice_post", () => {
    for (const key of [
      "whatsapp_outreach",
      "knowledge_base_enhancement",
      "substack_post",
      "reddit_post",
      "social_voice_post",
    ]) {
      assert.equal(isSupportedAssetInteractionType(key), true);
    }
  });

  it("Executive Version raw JSON recovery includes all optional assets", () => {
    const composed = composeSuggestedCtaFromRawAssetObject({
      PERSONALIZED_OUTREACH_EMAIL: "Hello",
      WHATSAPP_OUTREACH: "INITIAL MESSAGE\nHi",
      KNOWLEDGE_BASE_ENHANCEMENT: "## Business Overview\n- Clinic",
      SUBSTACK_POST: "TITLE\nArticle",
      REDDIT_POST: "SUGGESTED TITLE\nPost",
      SOCIAL_VOICE_POST: "As a CEO, I see this every week.",
    });
    assert.match(composed ?? "", /WHATSAPP_OUTREACH:/);
    assert.match(composed ?? "", /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(composed ?? "", /SUBSTACK_POST:/);
    assert.match(composed ?? "", /REDDIT_POST:/);
    assert.match(composed ?? "", /SOCIAL_VOICE_POST:/);
  });

  it("missing optional assets do not affect the 14-asset completeness contract", () => {
    assert.deepEqual(
      [...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS],
      [
        "PERSONALIZED_OUTREACH_EMAIL",
        "FOLLOW_UP_EMAIL",
        "LINKEDIN_CONNECTION",
        "LINKEDIN_FOLLOW_UP",
        "COLD_CALL_OPENING",
        "DISCOVERY_QUESTIONS",
        "PERSONALIZED_VALUE_PROPOSITION",
        "OBJECTION_ANTICIPATION",
        "MEETING_PREPARATION",
        "RECOMMENDED_CTA",
        "FOLLOW_UP_SEQUENCE",
        "PERSONALIZED_VIDEO_SCRIPT",
        "NEWSLETTER_IDEA",
        "BLOG_POST_IDEA",
      ],
    );
    assert.ok(
      !REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.includes(
        "WHATSAPP_OUTREACH" as never,
      ),
    );

    const onlyRequired = labeledRequiredBlock();
    const parsed = extractProspectDeploymentAssetKeys(onlyRequired);
    assert.equal(isCompleteProspectDeploymentAssetSet(parsed), true);
    assert.equal(unwrapProspectDeploymentAssetResponse(onlyRequired).isComplete, true);

    const withOptional = `${onlyRequired}\n\nWHATSAPP_OUTREACH:\nHi\n\nREDDIT_POST:\nAsk`;
    assert.equal(
      unwrapProspectDeploymentAssetResponse(withOptional).isComplete,
      true,
    );
    assert.equal(
      extractProspectDeploymentAssetKeys(withOptional).length,
      14,
    );
  });

  it("does not change routing modules", () => {
    const routing = readFileSync(
      join(ROOT, "lib/llm/modelRouting.ts"),
      "utf8",
    );
    assert.doesNotMatch(routing, /prospect_deployment_assets/);
    assert.doesNotMatch(routing, /resolveDeploymentAssetsStage/);
    assert.match(routing, /deployment_assets: roles\.analysis/);
    assert.match(routing, /strategic_blueprint: roles\.premiumStrategicOutput/);
  });
});

describe("Prospect always-generate assets — every creation and refresh path", () => {
  it("manual, CSV/batch, and refresh enqueue paths share the same Deployment Assets prompt", () => {
    const importer = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const createRoute = readFileSync(
      join(ROOT, "app/api/prospects/route.ts"),
      "utf8",
    );
    const refreshRoute = readFileSync(
      join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    const executor = readFileSync(
      join(ROOT, "services/generationJobs/generationJobExecutor.ts"),
      "utf8",
    );
    const discussionWorkflow = readFileSync(
      join(ROOT, "services/workflows/discussionWorkflow.ts"),
      "utf8",
    );
    const deploymentWorkflow = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );

    assert.match(createRoute, /importProspectManual/);
    assert.match(importer, /importProspectManual/);
    assert.match(importer, /importProspectsFromRows/);
    assert.match(importer, /enqueueDiscussionGenerationJob/);
    assert.match(refreshRoute, /manual_refresh/);
    assert.match(executor, /processDiscussionEndToEnd/);
    assert.match(discussionWorkflow, /generateDeploymentAssets/);
    assert.match(deploymentWorkflow, /assembleDeploymentAssetsPrompt/);
  });

  it("Prospect initial manual generation requests all optional assets", () => {
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    assert.match(block, /every Prospect run/);
    for (const key of OPTIONAL) {
      assert.match(block, new RegExp(`(?:^|\\n)${key}:(?:\\n|$)`));
    }
  });

  it("Prospect CSV/batch generation requests all optional assets via the shared 26-heading prompt", () => {
    const headings = getProspectDeploymentGenerationHeadings();
    assert.equal(headings.length, 26);
    for (const key of OPTIONAL) {
      assert.ok(headings.includes(key));
    }
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    for (const key of headings) {
      assert.match(block, new RegExp(`(?:^|\\n)${key}:(?:\\n|$)`));
    }
  });

  it("Prospect refresh and append request Social Voice Post via the same shared prompt", () => {
    const refreshRoute = readFileSync(
      join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    const updatesRoute = readFileSync(
      join(ROOT, "app/api/prospects/[id]/updates/route.ts"),
      "utf8",
    );
    assert.match(refreshRoute, /manual_refresh/);
    assert.match(updatesRoute, /discussion_update/);
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    assert.equal(getProspectDeploymentGenerationHeadings().length, 26);
    for (const key of OPTIONAL) {
      assert.match(block, new RegExp(`(?:^|\\n)${key}:(?:\\n|$)`));
    }
  });

  it("every new Prospect generation run uses the same 26-heading prompt", () => {
    const headings = getProspectDeploymentGenerationHeadings();
    assert.deepEqual(headings, [
      ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
      ...OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
    ]);
    assert.equal(headings.length, 26);

    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: true,
    });
    for (const key of headings) {
      const matches = block.match(new RegExp(`${key}:`, "g")) ?? [];
      assert.equal(matches.length, 1, `${key} must appear exactly once as a heading`);
    }
  });

  it("optional assets including Social Voice Post persist into the Executive Version when returned", () => {
    const workflow = readFileSync(
      join(ROOT, "services/workflows/deploymentAssetsWorkflow.ts"),
      "utf8",
    );
    assert.match(workflow, /suggested_cta:\s*input\.assets\.suggested_cta/);
    assert.match(workflow, /raw_ai_response:\s*input\.rawResponse/);

    const returned = [
      labeledRequiredBlock(),
      "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nHi",
      "KNOWLEDGE_BASE_ENHANCEMENT:\n## Business Overview\n- Clinic",
      "SUBSTACK_POST:\nTITLE\nArticle",
      "REDDIT_POST:\nSUGGESTED TITLE\nAsk",
      "SOCIAL_VOICE_POST:\nAs a CEO, I talk every day with clients facing the same problem.",
    ].join("\n\n");

    const assets = buildDiscussionDeploymentAssets(stubAnalysis(returned), {
      prospectMode: true,
    });
    const keys = new Set(assets.map((asset) => asset.assetKey));
    assert.ok(keys.has("whatsapp_outreach"));
    assert.ok(keys.has("knowledge_base_enhancement"));
    assert.ok(keys.has("substack_post"));
    assert.ok(keys.has("reddit_post"));
    assert.ok(keys.has("social_voice_post"));

    const composed = composeSuggestedCtaFromRawAssetObject({
      WHATSAPP_OUTREACH: "INITIAL MESSAGE\nHi",
      KNOWLEDGE_BASE_ENHANCEMENT: "## Business Overview\n- Clinic",
      SUBSTACK_POST: "TITLE\nArticle",
      REDDIT_POST: "SUGGESTED TITLE\nAsk",
      SOCIAL_VOICE_POST: "As a CEO, I talk every day with clients facing the same problem.",
    });
    assert.match(composed ?? "", /WHATSAPP_OUTREACH:/);
    assert.match(composed ?? "", /KNOWLEDGE_BASE_ENHANCEMENT:/);
    assert.match(composed ?? "", /SUBSTACK_POST:/);
    assert.match(composed ?? "", /REDDIT_POST:/);
    assert.match(composed ?? "", /SOCIAL_VOICE_POST:/);
  });

  it("Discussion generation does not request Prospect-only optional assets", () => {
    const block = buildDeploymentAssetsRequiredOutputInstructions({
      isProspectSource: false,
    });
    for (const key of [
      "WHATSAPP_OUTREACH",
      "KNOWLEDGE_BASE_ENHANCEMENT",
      "HIDDEN_GEMS",
      "SUBSTACK_POST",
      "SUBSTACK_NOTE",
      "REDDIT_POST",
      "SKOOL_POST",
      "SKOOL_COURSE_IDEA",
      "SOCIAL_VOICE_POST",
      "LOCAL_OUTREACH_IMAGE_PROMPT",
    ] as const) {
      assert.doesNotMatch(block, new RegExp(key));
    }
  });

  it("REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS remains exactly 14", () => {
    assert.equal(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.length, 14);
    for (const key of OPTIONAL) {
      assert.ok(
        !(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(
          key,
        ),
      );
    }
  });
});

describe("Social Voice Post — voice and Prospect-signal contracts", () => {
  it("prompt requires first-person content guided by Athena Brain Voice", () => {
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /first person singular/i);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /Athena Brain Voice/i);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /communication style/i);
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /Do not invent facts/i);

    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /SOCIAL_VOICE_POST_GENERATION_RULES/);
    assert.match(assembly, /Athena Brain Voice/);
  });

  it("prompt requires direct engagement with the Prospect signal", () => {
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /Prospect analysis/i);
    assert.match(
      SOCIAL_VOICE_POST_GENERATION_RULES,
      /signal, pain point, or opportunity/i,
    );
    assert.match(
      SOCIAL_VOICE_POST_GENERATION_RULES,
      /website intelligence/i,
    );
    assert.match(SOCIAL_VOICE_POST_GENERATION_RULES, /notes/i);
  });

  it("Gemini routing remains unchanged", () => {
    const routing = readFileSync(join(ROOT, "lib/llm/modelRouting.ts"), "utf8");
    assert.match(routing, /deployment_assets: roles\.analysis/);
    assert.match(routing, /strategic_blueprint: roles\.premiumStrategicOutput/);
    assert.doesNotMatch(routing, /prospect_deployment_assets/);
    assert.doesNotMatch(routing, /social_voice_post/);
  });
});
