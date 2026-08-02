/**
 * Translate Client Brand Identity into creative direction for visual
 * Deployment Asset prompts. Sent to the model as aesthetic guidance —
 * not a raw hex dump, and not used for UI theming.
 */

import {
  promptAlreadyContainsBrandDirection,
  resolveBrandFontDisplayName,
  toBlueprintBrandDirectionInput,
  VISUAL_BRAND_CREATIVE_DIRECTION_HEADING,
  type BlueprintBrandDirectionInput,
} from "@/services/identity/blueprintBrandDirection";
import type { OrganizationBrandIdentity } from "@/services/identity/brandIdentity";

const PREMIUM_NEUTRAL_FALLBACK = `
${VISUAL_BRAND_CREATIVE_DIRECTION_HEADING}
Use a premium neutral aesthetic — refined commercial photography, restrained palette, clean composition, high production value, timeless and polished without relying on a specific brand palette.
`.trim();

function inferAestheticLanguage(brand: BlueprintBrandDirectionInput): string[] {
  const cues: string[] = [];
  const primary = String(brand.primaryColor ?? "").trim().toUpperCase();
  const secondary = String(brand.secondaryColor ?? "").trim().toUpperCase();
  const accent = String(brand.accentColor ?? "").trim().toUpperCase();
  const background = String(brand.backgroundColor ?? "").trim().toUpperCase();
  const font = String(brand.font ?? "").trim().toLowerCase();

  const all = [primary, secondary, accent, background].filter(Boolean);
  const darkCount = all.filter((hex) => {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return false;
    return (r + g + b) / 3 < 90;
  }).length;
  const lightBg =
    background &&
    (() => {
      const r = Number.parseInt(background.slice(1, 3), 16);
      const g = Number.parseInt(background.slice(3, 5), 16);
      const b = Number.parseInt(background.slice(5, 7), 16);
      if ([r, g, b].some((n) => Number.isNaN(n))) return false;
      return (r + g + b) / 3 > 200;
    })();

  if (darkCount >= 2) {
    cues.push("dark premium / luxury editorial mood with deep contrast");
  } else if (lightBg) {
    cues.push("bright modern editorial clarity with airy negative space");
  } else if (all.length > 0) {
    cues.push("cohesive branded commercial aesthetic");
  }

  if (font.includes("mono") || font === "geist_mono") {
    cues.push("modern technical minimalism (Apple-like precision)");
  } else if (font === "georgia" || font === "times_new_roman") {
    cues.push("classic editorial / heritage typography sensibility");
  } else if (font === "geist" || font === "helvetica" || font === "arial") {
    cues.push("clean contemporary sans-serif brand language");
  }

  if (cues.length === 0) {
    cues.push("premium commercial brand consistency");
  }

  return cues;
}

/**
 * Format brand identity as creative direction for visual deployment prompts.
 * Returns premium-neutral fallback when no brand fields are configured.
 */
export function formatVisualBrandCreativeDirectionBlock(
  brand: OrganizationBrandIdentity | null | undefined,
): string {
  const direction = toBlueprintBrandDirectionInput(brand);
  if (!direction) {
    return PREMIUM_NEUTRAL_FALLBACK;
  }

  const hasAny = [
    direction.primaryColor,
    direction.secondaryColor,
    direction.accentColor,
    direction.backgroundColor,
    direction.font,
  ].some((value) => String(value ?? "").trim());

  if (!hasAny) {
    return PREMIUM_NEUTRAL_FALLBACK;
  }

  const aesthetic = inferAestheticLanguage(direction);
  const fontLabel = resolveBrandFontDisplayName(direction.font);
  const lines: string[] = [
    VISUAL_BRAND_CREATIVE_DIRECTION_HEADING,
    "Translate the client's Brand Identity into creative direction for all visual prompts — do not merely paste hex codes.",
    `Aesthetic intent: ${aesthetic.join("; ")}.`,
    "Maintain premium production quality, emotional clarity, and aesthetic consistency across Short Video Prompt, Visual Message Prompt, and Local Outreach Image Prompt (when present).",
  ];

  if (direction.primaryColor) {
    lines.push(
      `Palette anchor — primary: ${direction.primaryColor} (use as dominant brand accent in wardrobe, sets, or graphic accents when natural).`,
    );
  }
  if (direction.secondaryColor) {
    lines.push(`Secondary support: ${direction.secondaryColor}.`);
  }
  if (direction.accentColor) {
    lines.push(`Accent highlight: ${direction.accentColor}.`);
  }
  if (direction.backgroundColor) {
    lines.push(
      `Environment/background bias: ${direction.backgroundColor}.`,
    );
  }
  if (fontLabel) {
    lines.push(
      `Typography philosophy cue: ${fontLabel} — reflect this in on-screen type or design language only when text appears in frame.`,
    );
  }

  lines.push(
    "Prefer photography style, lighting, materiality, and composition that feel on-brand rather than generic stock.",
  );

  return lines.join("\n");
}

/**
 * Append Visual Brand Creative Direction to a visual prompt string once.
 * Used when composing stored visual prompts that may already include the block.
 */
export function appendVisualBrandCreativeDirectionOnce(
  prompt: string | null | undefined,
  brand: OrganizationBrandIdentity | null | undefined,
): string {
  const base = String(prompt ?? "").trim();
  const block = formatVisualBrandCreativeDirectionBlock(brand);
  if (!base) {
    return block;
  }
  if (promptAlreadyContainsBrandDirection(base)) {
    return base;
  }
  return `${base}\n\n${block}`;
}
