import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BLUEPRINT_ASSET_TYPES } from "../../services/assetInteractions/assetInteractionKeys";
import {
  composeBlueprintPromptWithBrandDirection,
  formatBlueprintBrandDirectionSuffix,
  resolveBrandFontDisplayName,
} from "../../services/identity/blueprintBrandDirection";

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

describe("Blueprint brand direction formatter", () => {
  it("1. returns empty string when no branding exists", () => {
    assert.equal(formatBlueprintBrandDirectionSuffix(null), "");
    assert.equal(formatBlueprintBrandDirectionSuffix({}), "");
    assert.equal(
      formatBlueprintBrandDirectionSuffix({
        primaryColor: "  ",
        font: "",
      }),
      "",
    );
  });

  it("2. includes all four colors and font", () => {
    const suffix = formatBlueprintBrandDirectionSuffix(FULL_BRAND);
    assert.match(suffix, /Primary color: #FF6600/);
    assert.match(suffix, /Secondary color: #1A1A1A/);
    assert.match(suffix, /Accent color: #F4F1EA/);
    assert.match(suffix, /Background color: #0B0B0F/);
    assert.match(suffix, /Font: Geist/);
  });

  it("3. includes only configured fields", () => {
    const suffix = formatBlueprintBrandDirectionSuffix({
      primaryColor: "#FF6600",
      font: "arial",
    });
    assert.match(suffix, /Primary color: #FF6600/);
    assert.match(suffix, /Font: Arial/);
    assert.doesNotMatch(suffix, /Secondary color:/);
    assert.doesNotMatch(suffix, /Accent color:/);
    assert.doesNotMatch(suffix, /Background color:/);
  });

  it("4. maps font identifiers to readable names", () => {
    assert.equal(resolveBrandFontDisplayName("geist"), "Geist");
    assert.equal(resolveBrandFontDisplayName("geist_mono"), "Geist Mono");
    assert.equal(resolveBrandFontDisplayName("times_new_roman"), "Times New Roman");
    assert.equal(resolveBrandFontDisplayName("system_ui"), "System UI");
    assert.equal(resolveBrandFontDisplayName("unknown_font"), null);
  });

  it("5/6. uses canonical wording and never outputs null/undefined", () => {
    const suffix = formatBlueprintBrandDirectionSuffix({
      primaryColor: "#FF6600",
      secondaryColor: null,
      accentColor: undefined,
      font: "helvetica",
    });
    assert.match(
      suffix,
      /^Brand direction:\nUse the following client brand specifications throughout the design:/,
    );
    assert.match(
      suffix,
      /Maintain strong visual consistency with this palette and typography\.$/,
    );
    assert.doesNotMatch(suffix, /null|undefined/i);
  });

  it("7/15. composes with exactly two newlines; empty brand leaves prompt unchanged", () => {
    const prompt = "Generate a bold hero image.\nWith depth.";
    const composed = composeBlueprintPromptWithBrandDirection(
      prompt,
      FULL_BRAND,
    );
    assert.equal(typeof composed, "string");
    assert.ok(String(composed).includes(`${prompt}\n\nBrand direction:`));

    const original = "Exact bytes unchanged.\n";
    assert.equal(
      composeBlueprintPromptWithBrandDirection(original, null),
      original,
    );
    assert.equal(
      composeBlueprintPromptWithBrandDirection(original, {}),
      original,
    );
    assert.equal(
      composeBlueprintPromptWithBrandDirection(null, FULL_BRAND),
      null,
    );
  });
});

describe("Blueprint brand direction wiring", () => {
  it("8-11. Discussion and Prospect Image/PDF prompts receive brand composition", () => {
    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.match(blueprint, /composeBlueprintPromptWithBrandDirection/);
    assert.match(blueprint, /imagePromptText/);
    assert.match(blueprint, /pdfPromptText/);
    assert.match(blueprint, /BLUEPRINT_ASSET_TYPES\.image_prompt/);
    assert.match(blueprint, /BLUEPRINT_ASSET_TYPES\.pdf_prompt/);
    assert.equal(
      BLUEPRINT_ASSET_TYPES.image_prompt,
      "blueprint_image_prompt",
    );
    assert.equal(BLUEPRINT_ASSET_TYPES.pdf_prompt, "blueprint_pdf_prompt");

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /brandDirection/);
    assert.match(workspace, /brandDirection=\{brandDirection\}/);

    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /getOrganizationBrandIdentity/);
    assert.match(discussionPage, /brandDirection=\{brandDirection\}/);

    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(prospectPage, /getOrganizationBrandIdentity/);
    assert.match(prospectPage, /brandDirection=\{brandDirection\}/);
  });

  it("12/13. non-graphic blueprint assets remain uncomposed", () => {
    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    const socialBlock = blueprint.slice(
      blueprint.indexOf('label="Social Prompt"'),
    );
    assert.match(socialBlock, /text=\{blueprint\.social_prompt\}/);
    assert.doesNotMatch(
      socialBlock.slice(0, 200),
      /composeBlueprintPromptWithBrandDirection/,
    );
    assert.match(blueprint, /text=\{blueprint\.notes\}/);
  });

  it("14. displayed and copied content share one composed value", () => {
    const block = read(
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
    );
    assert.match(block, /const content = text\?\.trim\(\)/);
    assert.match(block, /text=\{content\}/);
    assert.match(block, /\{hasContent \? content :/);
  });

  it("16. organization branding is loaded once per page render", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    const callMatches =
      discussionPage.match(/getOrganizationBrandIdentity\(/g) ?? [];
    assert.equal(callMatches.length, 1);
    assert.match(discussionPage, /toBlueprintBrandDirectionInput/);
    assert.doesNotMatch(discussionPage, /supabaseAdmin/);
  });

  it("17-21. no persistence, EV mutation, generation, or model call", () => {
    const formatter = read(
      "services/identity/blueprintBrandDirection.ts",
    );
    assert.match(formatter, /Never sent to models/);
    assert.match(formatter, /never persisted/);
    assert.doesNotMatch(formatter, /supabase|generateReview|enqueue/i);

    const blueprint = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );
    assert.doesNotMatch(blueprint, /updateOrganizationBrandIdentity|\.update\(/);

    const service = read(
      "services/assetBlueprints/assetBlueprintService.ts",
    );
    assert.doesNotMatch(service, /brandDirection|Brand direction/);
  });

  it("22/23. copy tracking and Copy/Copied/Done remain on CopyButton path", () => {
    const block = read(
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
    );
    assert.match(block, /<CopyButton/);
    assert.match(block, /initiallyDone/);
    assert.match(block, /initiallyTags/);
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /copied \? "Copied" : "Copy"/);
    assert.match(copy, /\bDone\b/);
  });

  it("24/25. branding-read failure falls back; org from session", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    assert.match(discussionPage, /\[BRAND_DIRECTION\] discussion_load_failed/);
    assert.match(discussionPage, /return null/);
    assert.match(discussionPage, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(
      discussionPage,
      /getOrganizationBrandIdentity\([^)]*params/,
    );

    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(prospectPage, /\[BRAND_DIRECTION\] prospect_load_failed/);
  });
});
