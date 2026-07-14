/**
 * Normalized Executive Intelligence input for Prospect sources.
 * The Executive Brain continues to consume text via the Discussion bridge;
 * this module is the isolated normalization seam for a future source adapter.
 */

import type { HomepageIntelligence } from "@/services/prospects/prospectWebsiteIntelligence";

export type ProspectFieldSnapshot = {
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
  first_name?: string | null;
  last_name?: string | null;
  timezone?: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number?: string | null;
  google_business_url: string | null;
  notes: string | null;
  additional_context: string | null;
  ads_content: string | null;
  source: string | null;
  website_intelligence: HomepageIntelligence | Record<string, unknown> | null;
};

export type NormalizedExecutiveSourceInput = {
  sourceType: "prospect";
  identity: {
    name: string;
    website: string | null;
    industry: string | null;
    category: string | null;
    geography: string | null;
    companySize: string | null;
    revenue: string | null;
    employeeCount: string | null;
  };
  contacts: {
    decisionMaker: string | null;
    firstName: string | null;
    lastName: string | null;
    timezone: string | null;
    jobTitle: string | null;
    email: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    linkedin: string | null;
    facebook: string | null;
    instagram: string | null;
    googleBusinessUrl: string | null;
  };
  operatorNotes: string | null;
  additionalContext: string | null;
  adsContent: string | null;
  technologies: string | null;
  painPoints: string | null;
  homepageIntelligence: HomepageIntelligence | Record<string, unknown> | null;
};

function joinGeography(prospect: ProspectFieldSnapshot): string | null {
  const parts = [prospect.address, prospect.city, prospect.state, prospect.country]
    .map((value) => value?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function normalizeProspectExecutiveInput(
  prospect: ProspectFieldSnapshot,
): NormalizedExecutiveSourceInput {
  return {
    sourceType: "prospect",
    identity: {
      name: prospect.business_name,
      website: prospect.website,
      industry: prospect.industry,
      category: prospect.category,
      geography: joinGeography(prospect),
      companySize: prospect.company_size,
      revenue: prospect.revenue,
      employeeCount: prospect.employee_count,
    },
    contacts: {
      decisionMaker: prospect.decision_maker,
      firstName: prospect.first_name ?? null,
      lastName: prospect.last_name ?? null,
      timezone: prospect.timezone ?? null,
      jobTitle: prospect.job_title,
      email: prospect.email,
      phone: prospect.phone,
      whatsappNumber: prospect.whatsapp_number ?? null,
      linkedin: prospect.linkedin,
      facebook: prospect.facebook,
      instagram: prospect.instagram,
      googleBusinessUrl: prospect.google_business_url,
    },
    operatorNotes: prospect.notes,
    additionalContext: prospect.additional_context,
    adsContent: prospect.ads_content,
    technologies: prospect.technologies,
    painPoints: prospect.pain_points,
    homepageIntelligence: prospect.website_intelligence,
  };
}

/** Serialize normalized prospect input into the bridge discussion body. */
export function formatNormalizedProspectInputForPipeline(
  input: NormalizedExecutiveSourceInput,
): string {
  const homepage = input.homepageIntelligence ?? {};
  const lines = [
    "EXECUTIVE INTELLIGENCE SOURCE: PROSPECT",
    `Business Name: ${input.identity.name}`,
    input.identity.website ? `Website: ${input.identity.website}` : null,
    input.identity.industry ? `Industry: ${input.identity.industry}` : null,
    input.identity.category ? `Category: ${input.identity.category}` : null,
    input.identity.geography ? `Location: ${input.identity.geography}` : null,
    input.identity.companySize
      ? `Company Size: ${input.identity.companySize}`
      : null,
    input.identity.revenue ? `Revenue: ${input.identity.revenue}` : null,
    input.identity.employeeCount
      ? `Employee Count: ${input.identity.employeeCount}`
      : null,
    input.contacts.decisionMaker
      ? `Decision Maker: ${input.contacts.decisionMaker}${
          input.contacts.jobTitle ? ` (${input.contacts.jobTitle})` : ""
        }`
      : null,
    input.contacts.firstName
      ? `Contact First Name: ${input.contacts.firstName}`
      : null,
    input.contacts.lastName
      ? `Contact Last Name: ${input.contacts.lastName}`
      : null,
    input.contacts.timezone ? `Timezone: ${input.contacts.timezone}` : null,
    input.contacts.email ? `Email: ${input.contacts.email}` : null,
    input.contacts.phone ? `Phone: ${input.contacts.phone}` : null,
    input.contacts.whatsappNumber
      ? `WhatsApp: ${input.contacts.whatsappNumber}`
      : null,
    input.contacts.linkedin ? `LinkedIn: ${input.contacts.linkedin}` : null,
    input.contacts.facebook ? `Facebook: ${input.contacts.facebook}` : null,
    input.contacts.instagram ? `Instagram: ${input.contacts.instagram}` : null,
    input.contacts.googleBusinessUrl
      ? `Google Business: ${input.contacts.googleBusinessUrl}`
      : null,
    input.operatorNotes ? `Notes:\n${input.operatorNotes}` : null,
    input.additionalContext
      ? `Additional Context:\n${input.additionalContext}`
      : null,
    input.adsContent ? `Ads Content:\n${input.adsContent}` : null,
    input.technologies ? `Technologies:\n${input.technologies}` : null,
    input.painPoints ? `Pain Points:\n${input.painPoints}` : null,
    "",
    "NORMALIZED HOMEPAGE INTELLIGENCE",
    typeof homepage.positioning === "string" && homepage.positioning
      ? `Positioning:\n${homepage.positioning}`
      : null,
    typeof homepage.products === "string" && homepage.products
      ? `Products:\n${homepage.products}`
      : null,
    typeof homepage.services === "string" && homepage.services
      ? `Services:\n${homepage.services}`
      : null,
    typeof homepage.about === "string" && homepage.about
      ? `About:\n${homepage.about}`
      : null,
    typeof homepage.target_audience === "string" && homepage.target_audience
      ? `Target Audience:\n${homepage.target_audience}`
      : null,
    typeof homepage.messaging === "string" && homepage.messaging
      ? `Messaging:\n${homepage.messaging}`
      : null,
    typeof homepage.value_proposition === "string" &&
    homepage.value_proposition
      ? `Value Proposition:\n${homepage.value_proposition}`
      : null,
    typeof homepage.cta === "string" && homepage.cta
      ? `CTA:\n${homepage.cta}`
      : null,
    typeof homepage.differentiators === "string" && homepage.differentiators
      ? `Differentiators:\n${homepage.differentiators}`
      : null,
    typeof homepage.trust_signals === "string" && homepage.trust_signals
      ? `Trust Signals:\n${homepage.trust_signals}`
      : null,
    typeof homepage.contact_information === "string" &&
    homepage.contact_information
      ? `Contact Information:\n${homepage.contact_information}`
      : null,
    typeof homepage.brand_tone === "string" && homepage.brand_tone
      ? `Brand Tone:\n${homepage.brand_tone}`
      : null,
    typeof homepage.headings === "string" && homepage.headings
      ? `Headings:\n${homepage.headings}`
      : null,
    typeof homepage.paragraphs === "string" && homepage.paragraphs
      ? `Key Content:\n${homepage.paragraphs}`
      : null,
  ].filter(Boolean);

  return lines.join("\n");
}
