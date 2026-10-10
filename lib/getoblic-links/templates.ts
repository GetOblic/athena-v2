import type { GetOblicLinkTemplateId } from "@/lib/getoblic-links/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type GetOblicTemplateField = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type GetOblicLinkTemplate = {
  id: GetOblicLinkTemplateId;
  label: string;
  description: string;
  baseUrl: string | null;
  fields: GetOblicTemplateField[];
};

const CLAIM_ORIGIN = "https://claim.getoblic.com";

/**
 * French uses a distinct pathname. Every other language, and an omitted
 * language, uses the shared non-French pathname.
 */
const GUIDED_TEMPLATE_PATHS = {
  business_created: {
    fr: "/business-demo-compte-ia-page",
    default: "/business-created-page",
  },
  ai_calendar: {
    fr: "/business-portfolio-calendrier-ia",
    default: "/business-portfolio-booking-page",
  },
} as const;

type GuidedTemplateId = keyof typeof GUIDED_TEMPLATE_PATHS;

const CONTACT_ID_FIELD: GetOblicTemplateField = {
  key: "contact_id",
  label: "Contact ID",
  placeholder: "contact_…",
  required: true,
};

const BUSINESS_NAME_FIELD: GetOblicTemplateField = {
  key: "business_name",
  label: "Business Name",
  placeholder: "Acme Salon",
  required: true,
};

function guidedTemplateBaseUrl(
  templateId: GuidedTemplateId,
  language?: OrganizationLanguage,
): string {
  const paths = GUIDED_TEMPLATE_PATHS[templateId];
  const pathname = language === "fr" ? paths.fr : paths.default;
  return `${CLAIM_ORIGIN}${pathname}`;
}

function isGuidedTemplateId(id: GetOblicLinkTemplateId): id is GuidedTemplateId {
  return id === "business_created" || id === "ai_calendar";
}

export const GETOBLIC_LINK_TEMPLATES: readonly GetOblicLinkTemplate[] = [
  {
    id: "business_created",
    label: "Business Created",
    description: "Claim page for a newly created business listing.",
    baseUrl: guidedTemplateBaseUrl("business_created"),
    fields: [CONTACT_ID_FIELD, BUSINESS_NAME_FIELD],
  },
  {
    id: "ai_calendar",
    label: "AI Calendar",
    description: "Voice AI calendar booking page.",
    baseUrl: guidedTemplateBaseUrl("ai_calendar"),
    fields: [CONTACT_ID_FIELD, BUSINESS_NAME_FIELD],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Any valid HTTP or HTTPS destination URL.",
    baseUrl: null,
    fields: [],
  },
] as const;

export function getGetOblicLinkTemplate(
  id: GetOblicLinkTemplateId,
): GetOblicLinkTemplate {
  const template = GETOBLIC_LINK_TEMPLATES.find((entry) => entry.id === id);
  if (!template) {
    throw new Error(`Unknown GetOblic link template: ${id}`);
  }
  return template;
}

/**
 * Build a destination URL from a guided template.
 * Always uses URL + URLSearchParams — never string concatenation.
 * Omitted language uses the non-French pathname.
 */
export function buildTemplateDestinationUrl(input: {
  templateId: GetOblicLinkTemplateId;
  params?: Record<string, string>;
  customUrl?: string;
  language?: OrganizationLanguage;
}): string {
  const template = getGetOblicLinkTemplate(input.templateId);

  if (template.id === "custom") {
    const custom = (input.customUrl ?? "").trim();
    if (!custom) {
      throw new Error("A destination URL is required for the Custom template.");
    }
    let parsed: URL;
    try {
      parsed = new URL(custom);
    } catch {
      throw new Error("Enter a valid HTTP or HTTPS URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Enter a valid HTTP or HTTPS URL.");
    }
    if (!parsed.hostname) {
      throw new Error("Enter a valid HTTP or HTTPS URL.");
    }
    return parsed.toString();
  }

  if (!isGuidedTemplateId(template.id) || !template.baseUrl) {
    throw new Error(`Template ${template.id} is missing a base URL.`);
  }

  const url = new URL(guidedTemplateBaseUrl(template.id, input.language));
  const search = new URLSearchParams();
  const params = input.params ?? {};

  for (const field of template.fields) {
    const value = (params[field.key] ?? "").trim();
    if (!value) {
      if (field.required) {
        throw new Error(`${field.label} is required.`);
      }
      continue;
    }
    search.set(field.key, value);
  }

  url.search = search.toString();
  return url.toString();
}
