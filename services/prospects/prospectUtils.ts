/**
 * Pure Prospect Intelligence helpers (no DB imports).
 */

import {
  formatNormalizedProspectInputForPipeline,
  normalizeProspectExecutiveInput,
} from "@/services/prospects/prospectNormalization";

export type ProspectAnalysisFields = {
  business_name: string;
  website: string | null;
  linkedin: string | null;
  facebook: string | null;
  instagram: string | null;
  industry: string | null;
  category: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  company_size: string | null;
  revenue: string | null;
  employee_count: string | null;
  technologies: string | null;
  pain_points: string | null;
  decision_maker: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  google_business_url: string | null;
  notes: string | null;
  additional_context: string | null;
  ads_content: string | null;
  source?: string | null;
  website_intelligence: Record<string, unknown> | null;
};

export function normalizeWebsiteUrl(value?: string | null): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) {
      return null;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Resolve a stable display name when Business Name is empty. */
export function resolveProspectBusinessName(input: {
  business_name?: string | null;
  website?: string | null;
  decision_maker?: string | null;
}): string | null {
  const name = String(input.business_name ?? "").trim();
  if (name) return name;

  const website = normalizeWebsiteUrl(input.website);
  if (website) {
    try {
      return new URL(website).hostname.replace(/^www\./i, "");
    } catch {
      /* ignore */
    }
  }

  const contact = String(input.decision_maker ?? "").trim();
  if (contact) return contact;

  return null;
}

export function buildProspectAnalysisBody(
  prospect: ProspectAnalysisFields,
): string {
  return formatNormalizedProspectInputForPipeline(
    normalizeProspectExecutiveInput({
      ...prospect,
      source: prospect.source ?? null,
    }),
  );
}

/** Fields that should enqueue regeneration when changed. */
export const PROSPECT_MEANINGFUL_EDIT_FIELDS = [
  "business_name",
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "industry",
  "category",
  "country",
  "state",
  "city",
  "address",
  "company_size",
  "revenue",
  "employee_count",
  "technologies",
  "pain_points",
  "decision_maker",
  "job_title",
  "email",
  "phone",
  "google_business_url",
  "notes",
  "additional_context",
  "ads_content",
] as const;

export function hasMeaningfulProspectEdit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return PROSPECT_MEANINGFUL_EDIT_FIELDS.some((field) => {
    const left = String(before[field] ?? "").trim();
    const right = String(after[field] ?? "").trim();
    return left !== right;
  });
}
