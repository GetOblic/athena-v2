import type { GetOblicLinkTemplateId } from "@/lib/getoblic-links/types";

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

export const GETOBLIC_LINK_TEMPLATES: readonly GetOblicLinkTemplate[] = [
  {
    id: "business_created",
    label: "Business Created",
    description: "Claim page for a newly created business listing.",
    baseUrl: "https://claim.getoblic.com/business-created-page",
    fields: [
      {
        key: "contact_id",
        label: "Contact ID",
        placeholder: "contact_…",
        required: true,
      },
      {
        key: "business_name",
        label: "Business Name",
        placeholder: "Acme Salon",
        required: true,
      },
    ],
  },
  {
    id: "ai_calendar",
    label: "AI Calendar",
    description: "Voice AI calendar booking page.",
    baseUrl: "https://voiceai.getoblic.com/ai-calendar-page",
    fields: [
      {
        key: "contact_id",
        label: "Contact ID",
        placeholder: "contact_…",
        required: true,
      },
    ],
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
 */
export function buildTemplateDestinationUrl(input: {
  templateId: GetOblicLinkTemplateId;
  params?: Record<string, string>;
  customUrl?: string;
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

  if (!template.baseUrl) {
    throw new Error(`Template ${template.id} is missing a base URL.`);
  }

  const url = new URL(template.baseUrl);
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
