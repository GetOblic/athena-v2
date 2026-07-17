import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parseLabeledDeploymentAssets,
} from "../../lib/deploymentAssets";
import {
  OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_META,
  PROSPECT_DEPLOYMENT_SECTION_LABELS,
} from "../../services/ai/prompts/prospectDeploymentAssetsConstraints";
import {
  DEPLOYMENT_SECTION_LABELS,
} from "../../services/ai/prompts/sharedPromptConstraints";
import {
  LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES,
  SHORT_VIDEO_PROMPT_GENERATION_RULES,
  VISUAL_MESSAGE_PROMPT_GENERATION_RULES,
} from "../../services/ai/prompts/visualDeploymentAssetsConstraints";
import { getProspectDeploymentGenerationHeadings } from "../../services/brain/generationContracts/deploymentAssetsRequiredOutput";
import { canonicalDeploymentAssetType } from "../../services/assetInteractions/assetInteractionKeys";
import { formatVisualBrandCreativeDirectionBlock } from "../../services/identity/visualBrandCreativeDirection";
import { composeSuggestedCtaFromRawAssetObject } from "../../services/executiveVersions/executiveVersionDisplay";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("V6 — Visual Deployment Assets", () => {
  it("Discussion generation requests Short Video and Visual Message, not Local Outreach", () => {
    assert.match(DEPLOYMENT_SECTION_LABELS, /SHORT_VIDEO_PROMPT:/);
    assert.match(DEPLOYMENT_SECTION_LABELS, /VISUAL_MESSAGE_PROMPT:/);
    assert.doesNotMatch(DEPLOYMENT_SECTION_LABELS, /LOCAL_OUTREACH_IMAGE_PROMPT/);

    const requiredOutput = read(
      "services/brain/generationContracts/deploymentAssetsRequiredOutput.ts",
    );
    assert.match(requiredOutput, /DEPLOYMENT_SECTION_LABELS/);
  });

  it("Prospect generation requests all three visual assets as optional always-generate headings", () => {
    assert.ok(
      OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("SHORT_VIDEO_PROMPT"),
    );
    assert.ok(
      OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS.includes("VISUAL_MESSAGE_PROMPT"),
    );
    assert.ok(
      OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS.includes(
        "LOCAL_OUTREACH_IMAGE_PROMPT",
      ),
    );
    assert.match(PROSPECT_DEPLOYMENT_SECTION_LABELS, /SHORT_VIDEO_PROMPT:/);
    assert.match(PROSPECT_DEPLOYMENT_SECTION_LABELS, /VISUAL_MESSAGE_PROMPT:/);
    assert.match(
      PROSPECT_DEPLOYMENT_SECTION_LABELS,
      /LOCAL_OUTREACH_IMAGE_PROMPT:/,
    );

    const headings = getProspectDeploymentGenerationHeadings();
    assert.equal(headings.length, 26);
    assert.ok(headings.includes("SHORT_VIDEO_PROMPT"));
    assert.ok(headings.includes("VISUAL_MESSAGE_PROMPT"));
    assert.ok(headings.includes("LOCAL_OUTREACH_IMAGE_PROMPT"));
    assert.equal(headings.indexOf("BLOG_POST_IDEA") < headings.indexOf("SHORT_VIDEO_PROMPT"), true);
    assert.equal(
      headings.indexOf("SHORT_VIDEO_PROMPT") <
        headings.indexOf("VISUAL_MESSAGE_PROMPT"),
      true,
    );
    assert.equal(
      headings.indexOf("VISUAL_MESSAGE_PROMPT") <
        headings.indexOf("LOCAL_OUTREACH_IMAGE_PROMPT"),
      true,
    );
  });

  it("prompt rules require prompt-only output and generator-compatible negative guidance", () => {
    for (const rules of [
      SHORT_VIDEO_PROMPT_GENERATION_RULES,
      VISUAL_MESSAGE_PROMPT_GENERATION_RULES,
      LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES,
    ]) {
      assert.match(rules, /Output ONLY the/i);
      assert.match(rules, /No explanation/i);
      assert.match(rules, /negative/i);
      assert.match(rules, /plastic skin/i);
    }

    assert.match(SHORT_VIDEO_PROMPT_GENERATION_RULES, /8 seconds|approximately 8/i);
    assert.match(SHORT_VIDEO_PROMPT_GENERATION_RULES, /Veo|Runway|Kling|Pika/);
    assert.match(VISUAL_MESSAGE_PROMPT_GENERATION_RULES, /infographic/i);
    assert.match(
      LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES,
      /never invent specific landmarks/i,
    );
    assert.match(LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES, /city/i);
    assert.match(LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES, /address/i);
  });

  it("Brand Identity creative direction uses aesthetic language and falls back to premium neutral", () => {
    const fallback = formatVisualBrandCreativeDirectionBlock(null);
    assert.match(fallback, /premium neutral/i);

    const empty = formatVisualBrandCreativeDirectionBlock({
      organization_id: "org-1",
      brand_logo_storage_path: null,
      brand_profile_picture_storage_path: null,
      brand_primary_color: null,
      brand_secondary_color: null,
      brand_accent_color: null,
      brand_background_color: null,
      brand_font: null,
    });
    assert.match(empty, /premium neutral/i);

    const branded = formatVisualBrandCreativeDirectionBlock({
      organization_id: "org-1",
      brand_logo_storage_path: null,
      brand_profile_picture_storage_path: null,
      brand_primary_color: "#111111",
      brand_secondary_color: "#C0A060",
      brand_accent_color: "#FFFFFF",
      brand_background_color: "#F7F5F0",
      brand_font: "georgia",
    });
    assert.match(branded, /Visual Brand Creative Direction/i);
    assert.match(branded, /Aesthetic intent/i);
    assert.match(branded, /#111111/);
    assert.doesNotMatch(branded, /premium neutral aesthetic/i);

    const assembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.match(assembly, /formatVisualBrandCreativeDirectionBlock/);
    assert.match(assembly, /SHORT_VIDEO_PROMPT_GENERATION_RULES/);
    assert.match(assembly, /VISUAL_MESSAGE_PROMPT_GENERATION_RULES/);
    assert.match(assembly, /LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES/);

    const workflow = read("services/workflows/deploymentAssetsWorkflow.ts");
    assert.match(workflow, /getOrganizationBrandIdentity/);
    assert.match(workflow, /brandIdentity/);
  });

  it("parser, Copy/Done keys, META titles, and EV recovery support the three assets", () => {
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.SHORT_VIDEO_PROMPT.title,
      "Short Video Prompt",
    );
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.VISUAL_MESSAGE_PROMPT.title,
      "Visual Message Prompt",
    );
    assert.equal(
      PROSPECT_DEPLOYMENT_ASSET_META.LOCAL_OUTREACH_IMAGE_PROMPT.title,
      "Local Outreach Image Prompt",
    );

    assert.equal(
      canonicalDeploymentAssetType("SHORT_VIDEO_PROMPT"),
      "short_video_prompt",
    );
    assert.equal(
      canonicalDeploymentAssetType("VISUAL_MESSAGE_PROMPT"),
      "visual_message_prompt",
    );
    assert.equal(
      canonicalDeploymentAssetType("LOCAL_OUTREACH_IMAGE_PROMPT"),
      "local_outreach_image_prompt",
    );

    const labeled = [
      "RECOMMENDED_CTA:\nBook a 15-minute call.",
      "NEWSLETTER_IDEA:\nA market brief for operators.",
      "BLOG_POST_IDEA:\nWhy local operators are switching.",
      "SHORT_VIDEO_PROMPT:\nCinematic vertical shot of a founder walking into a bright clinic, 8 seconds, natural light --neg plastic skin, distorted hands",
      "VISUAL_MESSAGE_PROMPT:\nEditorial photo of a calm handshake in soft morning light --no AI artifacts",
      "LOCAL_OUTREACH_IMAGE_PROMPT:\nDocumentary DSLR photo of two professionals meeting for coffee on a downtown street in Austin, Texas, natural light --no cartoon, no 3D render",
    ].join("\n\n");

    const assets = parseLabeledDeploymentAssets(labeled);
    const titles = assets.map((asset) => asset.title);
    assert.ok(titles.includes("Short Video Prompt"));
    assert.ok(titles.includes("Visual Message Prompt"));
    assert.ok(titles.includes("Local Outreach Image Prompt"));
    assert.equal(
      assets.find((a) => a.title === "Short Video Prompt")?.content.includes(
        "Cinematic vertical",
      ),
      true,
    );

    const composed = composeSuggestedCtaFromRawAssetObject({
      SHORT_VIDEO_PROMPT: "Video prompt body",
      VISUAL_MESSAGE_PROMPT: "Image prompt body",
      LOCAL_OUTREACH_IMAGE_PROMPT: "Local prompt body",
      RECOMMENDED_CTA: "Call next.",
    });
    assert.match(composed ?? "", /SHORT_VIDEO_PROMPT:/);
    assert.match(composed ?? "", /VISUAL_MESSAGE_PROMPT:/);
    assert.match(composed ?? "", /LOCAL_OUTREACH_IMAGE_PROMPT:/);
  });

  it("existing Deployment Assets and Ready completeness contract remain unchanged", () => {
    const contract = read("lib/prospectDeploymentAssetContract.ts");
    assert.match(
      contract,
      /REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS/,
    );
    // Visual assets are optional — not in the Ready 14.
    assert.doesNotMatch(
      contract.slice(
        contract.indexOf("export const REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS"),
        contract.indexOf("export type RequiredProspectDeploymentAssetKey"),
      ),
      /SHORT_VIDEO_PROMPT|VISUAL_MESSAGE_PROMPT|LOCAL_OUTREACH/,
    );

    const headings = getProspectDeploymentGenerationHeadings();
    assert.equal(headings.filter((h) => h === "PERSONALIZED_OUTREACH_EMAIL").length, 1);
    assert.ok(headings.includes("SOCIAL_VOICE_POST"));
  });
});
