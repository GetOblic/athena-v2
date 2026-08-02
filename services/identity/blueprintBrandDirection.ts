/**
 * Display/copy-time brand direction for Image Prompt and PDF Prompt.
 * Never sent to models; never persisted into blueprints or Executive Versions.
 */

import {
  BRAND_FONT_OPTIONS,
  type OrganizationBrandIdentity,
} from "@/services/identity/brandIdentity";

export type BlueprintBrandDirectionInput = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  font?: string | null;
};

/** Canonical brand-block headings used across Strategic and Deployment visual prompts. */
export const BRAND_DIRECTION_HEADING = "Brand direction:";
export const VISUAL_BRAND_CREATIVE_DIRECTION_HEADING =
  "Visual Brand Creative Direction:";

/**
 * Deterministic detection that a prompt already contains a brand direction block.
 * Recognizes both Strategic ("Brand direction:") and Deployment
 * ("Visual Brand Creative Direction:") headings.
 */
export function promptAlreadyContainsBrandDirection(
  prompt: string | null | undefined,
): boolean {
  const text = String(prompt ?? "");
  if (!text.trim()) return false;
  // Line-anchored headings only (case-insensitive). Prose like
  // "follow the brand direction" must not suppress branding.
  return (
    /(^|\n)\s*Brand direction:\s*/iu.test(text) ||
    /(^|\n)\s*Visual Brand Creative Direction:\s*/iu.test(text)
  );
}

const FONT_LABEL_BY_VALUE = new Map<string, string>(
  BRAND_FONT_OPTIONS.filter((option) => option.value).map((option) => [
    option.value,
    option.label,
  ]),
);

export function toBlueprintBrandDirectionInput(
  brand: OrganizationBrandIdentity | null | undefined,
): BlueprintBrandDirectionInput | null {
  if (!brand) return null;
  return {
    primaryColor: brand.brand_primary_color,
    secondaryColor: brand.brand_secondary_color,
    accentColor: brand.brand_accent_color,
    backgroundColor: brand.brand_background_color,
    font: brand.brand_font,
  };
}

export function resolveBrandFontDisplayName(
  font: string | null | undefined,
): string | null {
  const raw = String(font ?? "").trim();
  if (!raw) return null;
  return FONT_LABEL_BY_VALUE.get(raw) ?? null;
}

/**
 * Returns the branding suffix only, or "" when nothing is configured.
 */
export function formatBlueprintBrandDirectionSuffix(
  brand: BlueprintBrandDirectionInput | null | undefined,
): string {
  if (!brand) return "";

  const lines: string[] = [];
  const primary = String(brand.primaryColor ?? "").trim();
  const secondary = String(brand.secondaryColor ?? "").trim();
  const accent = String(brand.accentColor ?? "").trim();
  const background = String(brand.backgroundColor ?? "").trim();
  const fontLabel = resolveBrandFontDisplayName(brand.font);

  if (primary) lines.push(`- Primary color: ${primary}`);
  if (secondary) lines.push(`- Secondary color: ${secondary}`);
  if (accent) lines.push(`- Accent color: ${accent}`);
  if (background) lines.push(`- Background color: ${background}`);
  if (fontLabel) lines.push(`- Font: ${fontLabel}`);

  if (lines.length === 0) return "";

  return [
    BRAND_DIRECTION_HEADING,
    "Use the following client brand specifications throughout the design:",
    ...lines,
    "Maintain strong visual consistency with this palette and typography.",
  ].join("\n");
}

/**
 * Compose generated prompt + brand direction for display and clipboard.
 * When no brand fields are configured, returns the original prompt unchanged.
 * Does not append a second brand block when one is already present.
 */
export function composeBlueprintPromptWithBrandDirection(
  generatedPrompt: string | null | undefined,
  brand: BlueprintBrandDirectionInput | null | undefined,
): string | null | undefined {
  const suffix = formatBlueprintBrandDirectionSuffix(brand);
  if (!suffix) {
    return generatedPrompt;
  }

  const base = String(generatedPrompt ?? "");
  if (!base.trim()) {
    return generatedPrompt;
  }

  if (promptAlreadyContainsBrandDirection(base)) {
    return generatedPrompt;
  }

  return `${base.replace(/\s+$/u, "")}\n\n${suffix}`;
}
