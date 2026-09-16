import type {
  OrganizationBrandIdentity,
} from "@/services/identity/brandIdentity";
import type { SeoProspectPdfResolvedColors } from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

const HEX_RE = /^#?([0-9A-Fa-f]{6})$/;

const PAPER = "#FFFFFF";
const INK = "#1A1A1A";
const MUTED = "#5C5C5C";
const RULE = "#E4E4E7";
const SURFACE = "#F4F2EE";
const SURFACE_MUTED = "#EBE8E2";
const CODE_SURFACE = "#F3F1EC";
const STRENGTH_INK = "#2C4036";
const STRENGTH_SURFACE = "#EEF2EE";
const ATTENTION_INK = "#4F3B2F";
const ATTENTION_SURFACE = "#F4EFE9";
const PRIMARY_FALLBACK = "#1F3A5F";
const SECONDARY_FALLBACK = "#4A5568";
const ACCENT_FALLBACK = "#9A3412";

export function parseSafeBrandHex(
  value: string | null | undefined,
): string | null {
  const match = HEX_RE.exec(String(value ?? "").trim());
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function headingSafe(candidate: string | null, fallback: string): string {
  if (!candidate) return fallback;
  return contrastRatio(candidate, PAPER) >= 3 ? candidate : fallback;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channelValue) =>
      Math.max(0, Math.min(255, Math.round(channelValue)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

function mixHex(from: string, toward: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(toward);
  const mix = (left: number, right: number) =>
    left + (right - left) * amount;
  return rgbToHex(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b));
}

function readableOn(fill: string): string {
  return contrastRatio(PAPER, fill) >= 4.5 ? PAPER : INK;
}

function safeTint(brand: string): string {
  const tint = mixHex(brand, PAPER, 0.92);
  return relativeLuminance(tint) >= 0.86 && contrastRatio(INK, tint) >= 4.5
    ? tint
    : SURFACE;
}

export function resolveSeoProspectPdfColors(
  identity: OrganizationBrandIdentity | null | undefined,
): SeoProspectPdfResolvedColors {
  const primary = headingSafe(
    parseSafeBrandHex(identity?.brand_primary_color),
    PRIMARY_FALLBACK,
  );
  const secondary = headingSafe(
    parseSafeBrandHex(identity?.brand_secondary_color),
    SECONDARY_FALLBACK,
  );
  const accent = headingSafe(
    parseSafeBrandHex(identity?.brand_accent_color),
    ACCENT_FALLBACK,
  );
  const background = parseSafeBrandHex(identity?.brand_background_color);
  const coverWash =
    background &&
    contrastRatio(INK, background) >= 4.5 &&
    relativeLuminance(background) >= 0.72
      ? background
      : null;

  return {
    paper: PAPER,
    ink: INK,
    muted: MUTED,
    rule: RULE,
    primary,
    secondary,
    accent,
    coverWash,
    surface: SURFACE,
    surfaceMuted: SURFACE_MUTED,
    codeSurface: CODE_SURFACE,
    primaryTint: safeTint(primary),
    accentTint: safeTint(accent),
    onPrimary: readableOn(primary),
    onAccent: readableOn(accent),
    strengthInk: STRENGTH_INK,
    strengthSurface: STRENGTH_SURFACE,
    attentionInk: ATTENTION_INK,
    attentionSurface: ATTENTION_SURFACE,
  };
}
