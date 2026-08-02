import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BLUEPRINT_ASSET_TYPES } from "../../services/assetInteractions/assetInteractionKeys";
import {
  composeBlueprintPromptWithBrandDirection,
  promptAlreadyContainsBrandDirection,
} from "../../services/identity/blueprintBrandDirection";
import {
  appendVisualBrandCreativeDirectionOnce,
  formatVisualBrandCreativeDirectionBlock,
} from "../../services/identity/visualBrandCreativeDirection";
import { resolveReferencedAsset } from "../../services/prospectConversation/prospectConversationAssetResolve";
import type { ExecutiveIntelligencePayload } from "../../services/executiveVersions/executiveVersionTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const FULL_BRAND = {
  primaryColor: "#FF6600",
  secondaryColor: "#1A1A1A",
  accentColor: "#F4F1EA",
  backgroundColor: "#0B0B0F",
  font: "geist",
};

const ORG_BRAND = {
  organization_id: "org-1",
  brand_logo_storage_path: null,
  brand_profile_picture_storage_path: null,
  brand_primary_color: "#FF6600",
  brand_secondary_color: "#1A1A1A",
  brand_accent_color: "#F4F1EA",
  brand_background_color: "#0B0B0F",
  brand_font: "geist",
};

describe("Visual brand direction coverage", () => {
  it("11/12. Strategic image and PDF prompt composition includes Brand direction", () => {
    const image = composeBlueprintPromptWithBrandDirection(
      "Generate a bold hero image.",
      FULL_BRAND,
    );
    const pdf = composeBlueprintPromptWithBrandDirection(
      "Design a 6-page PDF.",
      FULL_BRAND,
    );
    assert.match(String(image), /Brand direction:/);
    assert.match(String(pdf), /Brand direction:/);
    assert.match(String(image), /Primary color: #FF6600/);
  });

  it("13. Historical Strategic assets receive live display-time brand composition", () => {
    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.match(blueprint, /composeBlueprintPromptWithBrandDirection/);
    assert.match(blueprint, /imagePromptText/);
    assert.match(blueprint, /pdfPromptText/);
    const service = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    assert.doesNotMatch(service, /Brand direction|composeBlueprintPrompt/);
  });

  it("14. Ask Athena / conversation resolution returns composed branded image/PDF prompts", () => {
    const payload = {
      blueprint: {
        id: "bp-1",
        discussion_id: "d-1",
        organization_id: "org-1",
        asset_title: "Title",
        asset_type: "image",
        business_goal: "Meetings",
        target_audience: "Owners",
        priority: "high",
        estimated_reuse: 3,
        image_prompt: "IMAGE PROMPT BODY",
        pdf_prompt: "PDF PROMPT BODY",
        social_prompt: "SOCIAL PROMPT BODY",
        notes: "NOTES",
        status: "ready",
        raw_json: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      analysis: null,
      opportunity: null,
      briefing: null,
    } as unknown as ExecutiveIntelligencePayload;

    const image = resolveReferencedAsset({
      payload,
      assetReference: {
        kind: "blueprint",
        key: BLUEPRINT_ASSET_TYPES.image_prompt,
      },
      brandDirection: FULL_BRAND,
    });
    assert.match(image.content, /IMAGE PROMPT BODY/);
    assert.match(image.content, /Brand direction:/);

    const pdf = resolveReferencedAsset({
      payload,
      assetReference: {
        kind: "blueprint",
        key: BLUEPRINT_ASSET_TYPES.pdf_prompt,
      },
      brandDirection: FULL_BRAND,
    });
    assert.match(pdf.content, /PDF PROMPT BODY/);
    assert.match(pdf.content, /Brand direction:/);

    const social = resolveReferencedAsset({
      payload,
      assetReference: {
        kind: "blueprint",
        key: BLUEPRINT_ASSET_TYPES.social_prompt,
      },
      brandDirection: FULL_BRAND,
    });
    assert.equal(social.content, "SOCIAL PROMPT BODY");
    assert.doesNotMatch(social.content, /Brand direction:/);

    const prospectCtx = read(
      "services/prospectConversation/prospectConversationContext.ts",
    );
    assert.match(prospectCtx, /composeBlueprintPromptWithBrandDirection/);
    assert.match(prospectCtx, /getOrganizationBrandIdentity/);
    const personaCtx = read(
      "services/personaConversation/personaConversationContext.ts",
    );
    assert.match(personaCtx, /composeBlueprintPromptWithBrandDirection/);
  });

  it("15/16. Deployment visual prompts contain Visual Brand Creative Direction once; duplicates not appended", () => {
    const branded = formatVisualBrandCreativeDirectionBlock(ORG_BRAND);
    assert.match(branded, /Visual Brand Creative Direction:/);
    assert.equal(
      (branded.match(/Visual Brand Creative Direction:/g) ?? []).length,
      1,
    );

    const already = `${"Short video prompt body"}\n\n${branded}`;
    assert.equal(promptAlreadyContainsBrandDirection(already), true);
    const once = appendVisualBrandCreativeDirectionOnce(already, ORG_BRAND);
    assert.equal(
      (once.match(/Visual Brand Creative Direction:/g) ?? []).length,
      1,
    );

    const composedTwice = composeBlueprintPromptWithBrandDirection(
      composeBlueprintPromptWithBrandDirection("Base prompt", FULL_BRAND),
      FULL_BRAND,
    );
    assert.equal(
      (String(composedTwice).match(/Brand direction:/g) ?? []).length,
      1,
    );

    const assembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.match(assembly, /formatVisualBrandCreativeDirectionBlock/);
    assert.match(assembly, /SHORT_VIDEO_PROMPT_GENERATION_RULES/);
    assert.match(assembly, /VISUAL_MESSAGE_PROMPT_GENERATION_RULES/);
    assert.match(assembly, /LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES/);
  });

  it("17/18. Persona Analysis visual prompt receives brand; non-visual sections do not", () => {
    const assembly = read(
      "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
    );
    assert.match(
      assembly,
      /buildPersonaAnalysisQualityStandard\(\{\s*visualBrandBlock/,
    );
    assert.match(
      assembly,
      /Apply Visual Brand Creative Direction when writing VISUAL_AND_IMAGE_PROMPT_DIRECTION/,
    );
    assert.match(
      assembly,
      /Do not add Visual Brand Creative Direction to non-visual Persona Analysis sections/,
    );

    const guide = read(
      "services/ai/prompts/personaDeploymentAssetsConstraints.ts",
    );
    assert.match(
      guide,
      /VISUAL_AND_IMAGE_PROMPT_DIRECTION[\s\S]*Visual Brand Creative Direction/,
    );
    assert.doesNotMatch(
      guide,
      /MESSAGING_FRAMEWORK[\s\S]{0,120}Visual Brand Creative Direction/,
    );
  });

  it("19. Brand fallback works with incomplete Identity data", () => {
    const fallback = formatVisualBrandCreativeDirectionBlock(null);
    assert.match(fallback, /premium neutral/i);
    assert.match(fallback, /Visual Brand Creative Direction:/);

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
  });

  it("20. Canonical asset keys remain unchanged", () => {
    assert.equal(
      BLUEPRINT_ASSET_TYPES.image_prompt,
      "blueprint_image_prompt",
    );
    assert.equal(BLUEPRINT_ASSET_TYPES.pdf_prompt, "blueprint_pdf_prompt");
    assert.equal(
      BLUEPRINT_ASSET_TYPES.social_prompt,
      "blueprint_social_prompt",
    );
    const keys = read(
      "services/assetInteractions/assetInteractionKeys.ts",
    );
    assert.match(keys, /short_video_prompt/);
    assert.match(keys, /visual_message_prompt/);
    assert.match(keys, /local_outreach_image_prompt/);
    assert.match(keys, /visual_and_image_prompt_direction/);
  });
});
