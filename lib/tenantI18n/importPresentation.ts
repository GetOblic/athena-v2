/**
 * Presentation-only Persona/Prospect import chrome.
 * Does not read or write CSV tokens, parser diagnostics, or import payloads.
 */
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

export const IMPORT_PREVIEW_STATUSES = [
  "ready",
  "duplicate",
  "warning",
  "invalid",
] as const;

export type ImportPreviewStatus = (typeof IMPORT_PREVIEW_STATUSES)[number];

export type ImportPreviewStatusLabels = {
  ready: string;
  duplicate: string;
  warning: string;
  invalid: string;
};

const PERSONA_IMPORT_FIELD_KEYS = {
  persona_name: "personaName",
  short_description: "shortDescription",
  additional_context: "additionalContext",
  reference_website: "referenceWebsite",
  notes: "notes",
  ads_content: "adsContent",
  category: "category",
  gender_identity: "genderIdentity",
  age_range: "ageRange",
  birth_year_approx: "birthYearApprox",
  generation: "generation",
  cultural_background: "culturalBackground",
  country: "country",
  state: "state",
  city: "city",
  location_summary: "locationSummary",
  languages: "languages",
  relationship_status: "relationshipStatus",
  household: "household",
  income_range: "incomeRange",
  purchasing_power: "purchasingPower",
  education: "education",
  occupation: "occupation",
  seniority: "seniority",
  industry_context: "industryContext",
  lifestyle: "lifestyle",
  interests: "interests",
  digital_behavior: "digitalBehavior",
  brands_influences: "brandsInfluences",
  values_text: "valuesText",
  aesthetic_preferences: "aestheticPreferences",
  preferred_imagery: "preferredImagery",
  goals: "goals",
  needs: "needs",
  pain_points: "painPoints",
  fears: "fears",
  motivations: "motivations",
  objections: "objections",
  buying_triggers: "buyingTriggers",
  decision_criteria: "decisionCriteria",
  purchase_behavior: "purchaseBehavior",
  typical_concerns: "typicalConcerns",
  communication_style: "communicationStyle",
  preferred_channels: "preferredChannels",
} as const satisfies Record<
  string,
  keyof TenantMessages["personas"]["metadata"]
>;

const PERSONA_IMPORT_GROUP_RESOLVERS: Record<
  string,
  (messages: TenantMessages) => string
> = {
  Demographics: (messages) => messages.personas.metadata.groupDemographics,
  "Geography and Language": (messages) =>
    messages.personas.metadata.groupGeography,
  "Family and Household": (messages) =>
    messages.personas.import.groupFamilyHousehold,
  "Financial Profile": (messages) => messages.personas.import.groupFinancial,
  "Education and Professional Context": (messages) =>
    messages.personas.import.groupEducationProfessional,
  "Lifestyle and Behavior": (messages) =>
    messages.personas.import.groupLifestyleBehavior,
  "Values and Aesthetics": (messages) =>
    messages.personas.import.groupValuesAesthetics,
  "Needs and Motivations": (messages) => messages.personas.metadata.groupNeeds,
  "Buying Behavior": (messages) => messages.personas.metadata.groupBuying,
  Communication: (messages) => messages.personas.metadata.groupCommunication,
};

const PROSPECT_IMPORT_FIELD_RESOLVERS: Record<
  string,
  (messages: TenantMessages) => string
> = {
  business_name: (messages) => messages.prospects.metadata.businessName,
  website: (messages) => messages.prospects.metadata.website,
  linkedin: (messages) => messages.prospects.import.linkedinUrl,
  facebook: (messages) => messages.prospects.import.facebookUrl,
  instagram: (messages) => messages.prospects.import.instagramUrl,
  industry: (messages) => messages.prospects.metadata.industry,
  category: (messages) => messages.prospects.metadata.category,
  country: (messages) => messages.prospects.metadata.country,
  state: (messages) => messages.prospects.metadata.state,
  city: (messages) => messages.prospects.metadata.city,
  address: (messages) => messages.prospects.metadata.address,
  decision_maker: (messages) => messages.prospects.metadata.decisionMaker,
  first_name: (messages) => messages.prospects.metadata.firstName,
  last_name: (messages) => messages.prospects.metadata.lastName,
  external_contact_id: (messages) =>
    messages.prospects.metadata.externalContactId,
  timezone: (messages) => messages.prospects.metadata.timezone,
  job_title: (messages) => messages.prospects.metadata.jobTitle,
  email: (messages) => messages.prospects.metadata.email,
  phone: (messages) => messages.prospects.metadata.phone,
  whatsapp_number: (messages) => messages.prospects.metadata.whatsappNumber,
  google_business_url: (messages) =>
    messages.prospects.metadata.googleBusinessUrl,
  company_size: (messages) => messages.prospects.metadata.companySize,
  revenue: (messages) => messages.prospects.metadata.revenue,
  employee_count: (messages) => messages.prospects.metadata.employeeCount,
  technologies: (messages) => messages.prospects.metadata.technologies,
  pain_points: (messages) => messages.prospects.metadata.painPoints,
  source: (messages) => messages.prospects.detail.source,
};

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

export function isImportPreviewStatus(
  value: string,
): value is ImportPreviewStatus {
  return (IMPORT_PREVIEW_STATUSES as readonly string[]).includes(value);
}

/**
 * Canonical preview status → localized visible label.
 * Unknown or raw values remain verbatim.
 */
export function getLocalizedImportPreviewStatus(
  labels: ImportPreviewStatusLabels,
  status: string,
): string {
  if (!isImportPreviewStatus(status)) {
    return status;
  }
  return firstNonEmpty(labels[status], status) || status;
}

export function getLocalizedPersonaImportFieldLabel(
  messages: TenantMessages,
  key: string,
): string {
  const metaKey =
    PERSONA_IMPORT_FIELD_KEYS[key as keyof typeof PERSONA_IMPORT_FIELD_KEYS];
  if (!metaKey) {
    return key;
  }
  return firstNonEmpty(
    messages.personas.metadata[metaKey],
    en.personas.metadata[metaKey],
    key,
  );
}

export function getLocalizedPersonaImportGroupTitle(
  messages: TenantMessages,
  title: string,
): string {
  const resolve = PERSONA_IMPORT_GROUP_RESOLVERS[title];
  if (!resolve) {
    return title;
  }
  return firstNonEmpty(resolve(messages), title);
}

export function getLocalizedProspectImportFieldLabel(
  messages: TenantMessages,
  key: string,
): string {
  const resolve = PROSPECT_IMPORT_FIELD_RESOLVERS[key];
  if (!resolve) {
    return key;
  }
  return firstNonEmpty(resolve(messages), key);
}
