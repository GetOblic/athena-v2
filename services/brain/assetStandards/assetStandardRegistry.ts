import {
  CAROUSEL_STANDARD,
  CHECKLIST_STANDARD,
  EMAIL_STANDARD,
  FRAMEWORK_STANDARD,
  LANDING_PAGE_STANDARD,
  LEAD_MAGNET_STANDARD,
  PDF_STANDARD,
  VIDEO_STANDARD,
  WEBINAR_STANDARD,
  formatExecutiveAssetStandardForPrompt,
} from "@/services/brain/assetStandards/assetStandards";
import type { ExecutiveAssetStandard } from "@/services/brain/assetStandards/assetStandardsTypes";

const STANDARD_REGISTRY: Record<string, ExecutiveAssetStandard> = {
  pdf: PDF_STANDARD,
  pdf_guide: PDF_STANDARD,
  blog_article: PDF_STANDARD,
  carousel: CAROUSEL_STANDARD,
  social_post: CAROUSEL_STANDARD,
  email: EMAIL_STANDARD,
  email_sequence: EMAIL_STANDARD,
  landing_page: LANDING_PAGE_STANDARD,
  video: VIDEO_STANDARD,
  video_script: VIDEO_STANDARD,
  lead_magnet: LEAD_MAGNET_STANDARD,
  webinar: WEBINAR_STANDARD,
  checklist: CHECKLIST_STANDARD,
  framework: FRAMEWORK_STANDARD,
  faq: CHECKLIST_STANDARD,
  image: LEAD_MAGNET_STANDARD,
};

export const SUPPORTED_ASSET_STANDARD_TYPES = [
  "pdf",
  "carousel",
  "email",
  "landing_page",
  "video",
  "lead_magnet",
  "webinar",
  "checklist",
  "framework",
] as const;

export function normalizeAssetStandardType(assetType: string): string {
  return assetType.trim().toLowerCase().replace(/\s+/g, "_");
}

export function resolveAssetStandard(assetType: string): ExecutiveAssetStandard {
  const normalized = normalizeAssetStandardType(assetType);
  return STANDARD_REGISTRY[normalized] ?? PDF_STANDARD;
}

export function listRegisteredAssetStandards(): ExecutiveAssetStandard[] {
  const seen = new Set<string>();
  const standards: ExecutiveAssetStandard[] = [];

  for (const type of SUPPORTED_ASSET_STANDARD_TYPES) {
    const standard = STANDARD_REGISTRY[type];
    if (standard && !seen.has(standard.assetType)) {
      seen.add(standard.assetType);
      standards.push(standard);
    }
  }

  return standards;
}

export function hasAssetStandard(assetType: string): boolean {
  const normalized = normalizeAssetStandardType(assetType);
  return normalized in STANDARD_REGISTRY;
}

export function getStandardForPreferredAssetType(
  preferredAssetType: string,
): ExecutiveAssetStandard {
  return resolveAssetStandard(preferredAssetType);
}

export {
  formatExecutiveAssetStandardForPrompt,
};
