/**
 * Frozen quotation palette.
 * Missing or low-contrast brand values fall back to a restrained
 * ink-and-orange document. Live organization colors are not consulted.
 */

import {
  contrastRatio,
  parseSafeBrandHex,
  relativeLuminance,
} from "@/services/seo/seoProspectPdf/seoProspectPdfColors";
import { mapBrandFontToPdfKit } from "@/services/seo/seoProspectPdf/seoProspectPdfFonts";
import type { SeoProspectPdfFontFamily } from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";
import type { ClientQuoteIssuedBrandSnapshot } from "@/services/clientQuote/clientQuoteTypes";

const PAPER = "#FFFFFF";
const INK = "#1C1917";
const MUTED = "#6B6560";
const RULE = "#E6E1DA";
const SURFACE = "#F7F4F0";
const ACCENT_FALLBACK = "#E36A1E";
const PRIMARY_FALLBACK = "#1C1917";

export type ClientQuotePdfTheme = {
  paper: string;
  ink: string;
  muted: string;
  rule: string;
  surface: string;
  primary: string;
  accent: string;
  onPrimary: string;
  fonts: SeoProspectPdfFontFamily;
};

function headingSafe(candidate: string | null, fallback: string): string {
  if (!candidate) return fallback;
  return contrastRatio(candidate, PAPER) >= 3 ? candidate : fallback;
}

function bodySafe(candidate: string | null, fallback: string): string {
  if (!candidate) return fallback;
  return contrastRatio(candidate, PAPER) >= 4.5 ? candidate : fallback;
}

function readableOn(fill: string): string {
  return contrastRatio(PAPER, fill) >= 4.5 ? PAPER : INK;
}

export function resolveClientQuotePdfTheme(
  brand: ClientQuoteIssuedBrandSnapshot | null | undefined,
): ClientQuotePdfTheme {
  const primary = headingSafe(
    parseSafeBrandHex(brand?.primaryColor),
    PRIMARY_FALLBACK,
  );
  const accent = headingSafe(parseSafeBrandHex(brand?.accentColor), ACCENT_FALLBACK);
  const background = parseSafeBrandHex(brand?.backgroundColor);
  const surface =
    background &&
    relativeLuminance(background) >= 0.9 &&
    contrastRatio(INK, background) >= 4.5
      ? background
      : SURFACE;
  const muted = bodySafe(parseSafeBrandHex(brand?.secondaryColor), MUTED);

  return {
    paper: PAPER,
    ink: INK,
    muted,
    rule: RULE,
    surface,
    primary,
    accent,
    onPrimary: readableOn(primary),
    fonts: mapBrandFontToPdfKit(brand?.font),
  };
}
