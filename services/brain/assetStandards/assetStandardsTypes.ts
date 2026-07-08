export const EXECUTIVE_ASSET_STANDARDS_VERSION = "executive_asset_standards_v1";

export type ExecutiveAssetStandard = {
  assetType: string;
  standardVersion: string;
  assetPurpose: string;
  businessObjective: string;
  expectedAudience: string;
  expectedReadingDepth: string;
  expectedStructure: string[];
  expectedSectionOrder: string[];
  expectedEducationalDepth: string;
  expectedExecutiveQuality: string;
  expectedVisualGuidance: string;
  expectedCtaPlacement: string;
  expectedReusability: string;
  commonMistakesToAvoid: string[];
  qualityChecklist: string[];
};

export type SupportedAssetStandardType =
  | "pdf"
  | "pdf_guide"
  | "carousel"
  | "email"
  | "email_sequence"
  | "landing_page"
  | "video"
  | "video_script"
  | "lead_magnet"
  | "webinar"
  | "checklist"
  | "framework";
