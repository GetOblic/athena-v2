import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { OrganizationBrandIdentity } from "@/services/identity/brandIdentity";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";
import type { SeoReportPackage } from "@/services/seo/seoReportTypes";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type SeoProspectPdfParty = {
  organizationId: string;
  name: string;
};

export type SeoProspectPdfParties = {
  subject: SeoProspectPdfParty;
  sender: SeoProspectPdfParty;
};

export type SeoProspectPdfSafeImage = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg";
};

export type SeoProspectPdfBrandAssets = {
  identity: OrganizationBrandIdentity | null;
  logo: SeoProspectPdfSafeImage | null;
  profilePicture: SeoProspectPdfSafeImage | null;
};

export type SeoProspectPdfResolvedColors = {
  paper: string;
  ink: string;
  muted: string;
  rule: string;
  primary: string;
  secondary: string;
  accent: string;
  coverWash: string | null;
  surface: string;
  surfaceMuted: string;
  codeSurface: string;
  primaryTint: string;
  accentTint: string;
  onPrimary: string;
  onAccent: string;
  strengthInk: string;
  strengthSurface: string;
  attentionInk: string;
  attentionSurface: string;
};

export type SeoProspectPdfSectionRole =
  | "body"
  | "snapshot"
  | "appendix"
  | "methodology"
  | "notes";

export type SeoProspectPdfListVariant =
  | "neutral"
  | "positive"
  | "opportunity"
  | "missing"
  | "attention";

export type SeoProspectPdfCardVariant =
  | "opportunity"
  | "inventory"
  | "metadata"
  | "link";

export type SeoProspectPdfCalloutTone = "neutral" | "strength" | "attention";

export type SeoProspectPdfMetricRow = {
  label: string;
  value: string;
  percent: number | null;
};

export type SeoProspectPdfBuiltInFont =
  | "Helvetica"
  | "Times-Roman"
  | "Courier";

export type SeoProspectPdfFontFamily = {
  regular: SeoProspectPdfBuiltInFont;
  bold:
    | "Helvetica-Bold"
    | "Times-Bold"
    | "Courier-Bold";
};

export type SeoProspectPdfField = {
  label: string;
  value: string;
};

export type SeoProspectPdfComparison = {
  label: string;
  current?: string;
  recommended?: string;
};

export type SeoProspectPdfPageRecord = {
  type: "pageRecord";
  title: string;
  url: string;
  meta: string[];
  issues: string[];
  comparisons: SeoProspectPdfComparison[];
};

export type SeoProspectPdfPriorityTone =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type SeoProspectPdfBlock =
  | { type: "paragraph"; text: string }
  | { type: "lede"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "fields"; entries: SeoProspectPdfField[] }
  | {
      type: "score";
      label: string;
      value: string;
      help: string;
      max?: number;
    }
  | {
      type: "priorityItem";
      tone: SeoProspectPdfPriorityTone;
      eyebrow: string;
      title: string;
      entries: SeoProspectPdfField[];
    }
  | {
      type: "pageCard";
      title: string;
      entries: SeoProspectPdfField[];
      variant?: SeoProspectPdfCardVariant;
      badge?: string;
    }
  | { type: "code"; text: string }
  | { type: "note"; text: string }
  | {
      type: "callout";
      tone: SeoProspectPdfCalloutTone;
      label: string;
      text: string;
    }
  | { type: "subsection"; title: string }
  | {
      type: "categoryList";
      variant: SeoProspectPdfListVariant;
      label: string;
      items: string[];
    }
  | { type: "metricRows"; entries: SeoProspectPdfMetricRow[] }
  | SeoProspectPdfPageRecord;

export type SeoProspectPdfSection = {
  id: string;
  title: string;
  blocks: SeoProspectPdfBlock[];
  role?: SeoProspectPdfSectionRole;
  eyebrow?: string;
  subtitle?: string;
  number?: number;
};

export type SeoProspectPdfDocumentModel = {
  lens: string;
  generationType: SeoGenerationType;
  analyzedDomain: string | null;
  reportDateIso: string;
  reportDateLabel: string;
  capturedAtLabel: string | null;
  title: string;
  sections: SeoProspectPdfSection[];
};

export type SeoProspectPdfRenderInput = {
  pkg: SeoReportPackage;
  parties: SeoProspectPdfParties;
  brand: SeoProspectPdfBrandAssets;
  messages: TenantMessages;
  language: OrganizationLanguage;
  reportDateIso: string;
};

export function flattenSeoProspectPdfDocument(
  model: SeoProspectPdfDocumentModel,
): string {
  const parts: string[] = [model.lens, model.title];
  if (model.analyzedDomain) parts.push(model.analyzedDomain);
  if (model.capturedAtLabel) parts.push(model.capturedAtLabel);
  parts.push(model.reportDateLabel);
  for (const section of model.sections) {
    if (section.eyebrow) parts.push(section.eyebrow);
    parts.push(section.title);
    if (section.subtitle) parts.push(section.subtitle);
    for (const block of section.blocks) {
      switch (block.type) {
        case "paragraph":
        case "lede":
        case "note":
        case "code":
          parts.push(block.text);
          break;
        case "score":
          parts.push(block.label, block.value, block.help);
          break;
        case "bullets":
          parts.push(...block.items);
          break;
        case "fields":
          parts.push(
            ...block.entries.flatMap((entry) => [entry.label, entry.value]),
          );
          break;
        case "priorityItem":
        case "pageCard":
          parts.push(
            block.title,
            ...block.entries.flatMap((entry) => [entry.label, entry.value]),
          );
          if (block.type === "priorityItem") parts.push(block.eyebrow);
          if (block.type === "pageCard" && block.badge) parts.push(block.badge);
          break;
        case "callout":
          parts.push(block.label, block.text);
          break;
        case "subsection":
          parts.push(block.title);
          break;
        case "categoryList":
          parts.push(block.label, ...block.items);
          break;
        case "metricRows":
          parts.push(
            ...block.entries.flatMap((entry) => [entry.label, entry.value]),
          );
          break;
        case "pageRecord":
          parts.push(block.title, block.url, ...block.meta, ...block.issues);
          for (const comparison of block.comparisons) {
            parts.push(comparison.label);
            if (comparison.current) parts.push(comparison.current);
            if (comparison.recommended) parts.push(comparison.recommended);
          }
          break;
      }
    }
  }
  return parts.filter(Boolean).join("\n");
}
