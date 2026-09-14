/**
 * Trusted Prospect-derived market evidence composer for Audience creation.
 *
 * Architectural precedent: Estimate L15 Prospect composer.
 * Does not alter Estimate code. Does not persist. Does not invent facts.
 *
 * Re-fetches the Prospect with the session organization_id (fail closed).
 * Loads only organization-scoped current intelligence.
 * Geography is always included when present and is never silently discarded.
 */

import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { ExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionTypes";
import { readObservedListingDescription } from "@/services/prospects/prospectGetoblicDescription";
import type { Prospect } from "@/services/prospects/prospectService";
import {
  deepIntelligenceHasUsableContent,
  formatDeepIntelligenceForBrainPrompt,
  isDeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export const PROSPECT_AUDIENCE_CONTEXT_HEADER =
  "TRUSTED PROSPECT-DERIVED MARKET EVIDENCE" as const;

export const PROSPECT_AUDIENCE_CONTEXT_LIMITS = {
  profileMaxChars: 2_000,
  geographyMaxChars: 1_200,
  notesMaxChars: 2_500,
  adsMaxChars: 1_000,
  websiteMaxChars: 5_000,
  executiveMaxChars: 3_000,
  blueprintMaxChars: 1_500,
  getoblicMaxChars: 1_500,
  blockHardCap: 12_000,
  fieldTruncate: 220,
} as const;

export class ProspectAudienceContextCompositionError extends Error {
  readonly code = "PROSPECT_UNAVAILABLE";
  readonly retryable = false;

  constructor(message = "Prospect is unavailable.") {
    super(message);
    this.name = "ProspectAudienceContextCompositionError";
  }
}

export type ComposeProspectAudienceContextDeps = {
  getProspectById?: (
    prospectId: string,
    organizationId: string,
  ) => Promise<Prospect | null>;
  getCurrentExecutiveVersion?: (
    discussionId: string,
    organizationId: string,
  ) => Promise<ExecutiveIntelligenceVersion | null>;
  getAssetBlueprintById?: (
    blueprintId: string,
    organizationId: string,
  ) => Promise<AthenaAssetBlueprint | null>;
};

export type ComposeProspectAudienceContextResult = {
  composedText: string;
  prospectId: string;
  businessName: string;
};

type SectionKey =
  | "header"
  | "profile"
  | "geography"
  | "notes"
  | "painTech"
  | "ads"
  | "website"
  | "executive"
  | "blueprint"
  | "getoblic";

type BuiltSection = {
  key: SectionKey;
  title: string;
  body: string;
};

function truncateText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function clampBlock(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function fieldLine(
  label: string,
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${label}: ${truncateText(trimmed, PROSPECT_AUDIENCE_CONTEXT_LIMITS.fieldTruncate)}`;
}

function joinLines(lines: Array<string | null>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

const WEBSITE_SKIP_KEYS = new Set([
  "contact_information",
  "error",
  "email",
  "phone",
  "whatsapp_number",
  "first_name",
  "last_name",
]);

const WEBSITE_PREFERRED_KEYS = [
  "services",
  "products",
  "positioning",
  "target_audience",
  "messaging",
  "value_proposition",
  "differentiators",
  "trust_signals",
  "brand_tone",
  "about",
  "solutions",
  "specialties",
] as const;

/**
 * Bounded textual website intelligence — never a blind JSON dump.
 * Deep intelligence is used when provider = deep_v1 and content is usable.
 * Contact / PII keys are excluded.
 */
export function formatProspectWebsiteIntelligenceForAudience(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): string {
  if (!websiteIntelligence || typeof websiteIntelligence !== "object") {
    return "";
  }

  if (
    isDeepWebsiteIntelligence(websiteIntelligence) &&
    deepIntelligenceHasUsableContent(websiteIntelligence)
  ) {
    const formatted = formatDeepIntelligenceForBrainPrompt(websiteIntelligence)
      .split(/\n\n/)
      .filter((chunk) => !/^Contact:/i.test(chunk.trim()))
      .join("\n\n");
    return formatted.trim();
  }

  const record = websiteIntelligence as Record<string, unknown>;
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const key of WEBSITE_PREFERRED_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      seen.add(key);
      lines.push(
        `${key}:\n${truncateText(value, PROSPECT_AUDIENCE_CONTEXT_LIMITS.fieldTruncate * 4)}`,
      );
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (seen.has(key) || WEBSITE_SKIP_KEYS.has(key)) continue;
    if (
      key === "provider" ||
      key === "url" ||
      key === "scraped_at" ||
      key === "title" ||
      key === "headings" ||
      key === "paragraphs"
    ) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      lines.push(
        `${key}:\n${truncateText(value, PROSPECT_AUDIENCE_CONTEXT_LIMITS.fieldTruncate * 4)}`,
      );
    }
  }

  return lines.join("\n\n").trim();
}

function formatProfileSection(prospect: Prospect): string {
  return joinLines([
    fieldLine("business_name", prospect.business_name),
    fieldLine("website", prospect.website),
    fieldLine("industry", prospect.industry),
    fieldLine("category", prospect.category),
    fieldLine("company_size", prospect.company_size),
    fieldLine("employee_count", prospect.employee_count),
    fieldLine("revenue", prospect.revenue),
    fieldLine("job_title", prospect.job_title),
  ]);
}

export function formatProspectGeographySection(prospect: Prospect): string {
  return joinLines([
    fieldLine("city", prospect.city),
    fieldLine("state", prospect.state),
    fieldLine("country", prospect.country),
    fieldLine("address", prospect.address),
  ]);
}

function formatNotesSection(prospect: Prospect): string {
  const parts: string[] = [];
  if (prospect.notes?.trim()) {
    parts.push(
      `notes:\n${truncateText(prospect.notes, PROSPECT_AUDIENCE_CONTEXT_LIMITS.notesMaxChars)}`,
    );
  }
  if (prospect.additional_context?.trim()) {
    parts.push(
      `additional_context:\n${truncateText(
        prospect.additional_context,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.notesMaxChars,
      )}`,
    );
  }
  return clampBlock(
    parts.join("\n\n"),
    PROSPECT_AUDIENCE_CONTEXT_LIMITS.notesMaxChars,
  );
}

function formatPainTechSection(prospect: Prospect): string {
  return joinLines([
    fieldLine("pain_points", prospect.pain_points),
    fieldLine("technologies", prospect.technologies),
  ]);
}

function formatExecutiveExcerpts(
  version: ExecutiveIntelligenceVersion,
): string {
  const intelligence = version.intelligence;
  const parts: string[] = [];

  const analysis = intelligence?.analysis;
  if (analysis) {
    const analysisText = joinLines([
      fieldLine("summary", analysis.summary),
      fieldLine("intent", analysis.intent),
      fieldLine("buyer_stage", analysis.buyer_stage),
      fieldLine("pain_points", analysis.pain_points),
      fieldLine("opportunity_title", analysis.opportunity_title),
      fieldLine("opportunity_reason", analysis.opportunity_reason),
      fieldLine("recommended_action", analysis.recommended_action),
    ]);
    if (analysisText) {
      parts.push(`Analysis:\n${analysisText}`);
    }
  }

  const opportunity = intelligence?.opportunity;
  if (opportunity) {
    const opportunityText = joinLines([
      fieldLine("title", opportunity.title),
      fieldLine("reason", opportunity.reason),
      fieldLine("urgency", opportunity.urgency),
      fieldLine("intent", opportunity.intent),
      fieldLine("recommended_action", opportunity.recommended_action),
      fieldLine("ai_summary", opportunity.ai_summary),
      fieldLine("ai_recommendation", opportunity.ai_recommendation),
    ]);
    if (opportunityText) {
      parts.push(`Opportunity:\n${opportunityText}`);
    }
  }

  const briefing = intelligence?.briefing;
  if (briefing) {
    const briefingText = joinLines([
      fieldLine("summary", briefing.summary),
      fieldLine("pain_points", briefing.pain_points),
      fieldLine("buyer_stage", briefing.buyer_stage),
      fieldLine("recommended_response", briefing.recommended_response),
      fieldLine("notes", briefing.notes),
    ]);
    if (briefingText) {
      parts.push(`Briefing:\n${briefingText}`);
    }
  }

  return clampBlock(
    parts.join("\n\n"),
    PROSPECT_AUDIENCE_CONTEXT_LIMITS.executiveMaxChars,
  );
}

export function formatBlueprintCommercialFieldsForAudience(
  blueprint: AthenaAssetBlueprint | null | undefined,
): string {
  if (!blueprint) return "";
  return clampBlock(
    joinLines([
      fieldLine("asset_title", blueprint.asset_title),
      fieldLine("asset_type", blueprint.asset_type),
      fieldLine("business_goal", blueprint.business_goal),
      fieldLine("target_audience", blueprint.target_audience),
      fieldLine("notes", blueprint.notes),
    ]),
    PROSPECT_AUDIENCE_CONTEXT_LIMITS.blueprintMaxChars,
  );
}

function renderSection(section: BuiltSection): string {
  if (section.key === "header") {
    return section.body;
  }
  return `${section.title}\n${section.body}`;
}

/**
 * Hard-cap assembly. Geography and the trusted header are never dropped.
 * Lower-priority commercial sections yield first.
 */
export function assembleProspectAudienceContextBlock(input: {
  businessName: string;
  profile: string;
  geography: string;
  notes: string;
  painTech: string;
  ads: string;
  website: string;
  executive: string;
  blueprint: string;
  getoblic: string;
}): string {
  const headerBody = [
    PROSPECT_AUDIENCE_CONTEXT_HEADER,
    "(Trusted Athena evidence about the real-world market archetype represented by this Prospect.",
    "This is primary market evidence for generating a reusable Audience / buyer / owner / operator type.",
    "It is not a profile of the Prospect business itself, not operator guidance, and not contact data.",
    "Do not invent unsupported local, commercial, or geographic facts.)",
    `business_name: ${input.businessName.trim()}`,
  ].join("\n");

  const sections: BuiltSection[] = [
    { key: "header", title: "", body: headerBody },
  ];

  const profile = clampBlock(
    input.profile,
    PROSPECT_AUDIENCE_CONTEXT_LIMITS.profileMaxChars,
  );
  if (profile) {
    sections.push({
      key: "profile",
      title: "Prospect factual / commercial profile",
      body: profile,
    });
  }

  const geography = clampBlock(
    input.geography,
    PROSPECT_AUDIENCE_CONTEXT_LIMITS.geographyMaxChars,
  );
  if (geography) {
    sections.push({
      key: "geography",
      title: "Prospect geographic market evidence",
      body: geography,
    });
  }

  if (input.notes.trim()) {
    sections.push({
      key: "notes",
      title: "Prospect commercial notes",
      body: clampBlock(
        input.notes,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.notesMaxChars,
      ),
    });
  }

  if (input.painTech.trim()) {
    sections.push({
      key: "painTech",
      title: "Prospect pain points / technologies",
      body: clampBlock(
        input.painTech,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.profileMaxChars,
      ),
    });
  }

  if (input.ads.trim()) {
    sections.push({
      key: "ads",
      title: "Prospect ads content",
      body: clampBlock(input.ads, PROSPECT_AUDIENCE_CONTEXT_LIMITS.adsMaxChars),
    });
  }

  if (input.website.trim()) {
    sections.push({
      key: "website",
      title: "Prospect website intelligence",
      body: clampBlock(
        input.website,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.websiteMaxChars,
      ),
    });
  }

  if (input.executive.trim()) {
    sections.push({
      key: "executive",
      title: "Current Executive Intelligence",
      body: clampBlock(
        input.executive,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.executiveMaxChars,
      ),
    });
  }

  if (input.blueprint.trim()) {
    sections.push({
      key: "blueprint",
      title: "Strategic Asset Blueprint (commercial fields)",
      body: clampBlock(
        input.blueprint,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.blueprintMaxChars,
      ),
    });
  }

  if (input.getoblic.trim()) {
    sections.push({
      key: "getoblic",
      title: "Imported GetOblic factual description",
      body: clampBlock(
        input.getoblic,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.getoblicMaxChars,
      ),
    });
  }

  const dropOrder: SectionKey[] = [
    "ads",
    "getoblic",
    "blueprint",
    "notes",
    "painTech",
    "website",
    "executive",
    "profile",
  ];

  const active = [...sections];
  const joinActive = () =>
    active.map(renderSection).filter(Boolean).join("\n\n");

  let composed = joinActive();
  for (const key of dropOrder) {
    if (composed.length <= PROSPECT_AUDIENCE_CONTEXT_LIMITS.blockHardCap) {
      break;
    }
    const idx = active.findIndex((section) => section.key === key);
    if (idx <= 0) continue;
    const section = active[idx]!;
    const overflow =
      composed.length - PROSPECT_AUDIENCE_CONTEXT_LIMITS.blockHardCap;
    const keepBody = Math.max(0, section.body.length - overflow - 1);
    if (keepBody < 40) {
      active.splice(idx, 1);
    } else {
      active[idx] = {
        ...section,
        body: clampBlock(section.body, keepBody),
      };
    }
    composed = joinActive();
  }

  if (composed.length > PROSPECT_AUDIENCE_CONTEXT_LIMITS.blockHardCap) {
    composed = clampBlock(
      composed,
      PROSPECT_AUDIENCE_CONTEXT_LIMITS.blockHardCap,
    );
  }

  if (
    input.geography.trim() &&
    !composed.includes("Prospect geographic market evidence")
  ) {
    const geographyBlock = `Prospect geographic market evidence\n${clampBlock(
      input.geography,
      PROSPECT_AUDIENCE_CONTEXT_LIMITS.geographyMaxChars,
    )}`;
    composed = clampBlock(
      `${headerBody}\n\n${geographyBlock}`,
      PROSPECT_AUDIENCE_CONTEXT_LIMITS.blockHardCap,
    );
  }

  return composed;
}

/**
 * Compose bounded trusted Prospect-derived market evidence for Persona generation.
 * Fail closed when Prospect is missing, wrong-org, or lacks business_name.
 */
export async function composeProspectAudienceContext(input: {
  prospectId: string;
  organizationId: string;
  deps?: ComposeProspectAudienceContextDeps;
}): Promise<ComposeProspectAudienceContextResult> {
  const prospectId = input.prospectId.trim();
  const organizationId = input.organizationId.trim();
  if (!prospectId || !organizationId) {
    throw new ProspectAudienceContextCompositionError();
  }

  const getProspect =
    input.deps?.getProspectById ??
    (await import("@/services/prospects/prospectService")).getProspectById;

  const prospect = await getProspect(prospectId, organizationId);
  if (!prospect) {
    throw new ProspectAudienceContextCompositionError();
  }

  const businessName =
    typeof prospect.business_name === "string"
      ? prospect.business_name.trim()
      : "";
  if (!businessName) {
    throw new ProspectAudienceContextCompositionError();
  }

  const profile = formatProfileSection(prospect);
  const geography = formatProspectGeographySection(prospect);
  const notes = formatNotesSection(prospect);
  const painTech = formatPainTechSection(prospect);
  const ads = prospect.ads_content?.trim()
    ? truncateText(
        prospect.ads_content,
        PROSPECT_AUDIENCE_CONTEXT_LIMITS.adsMaxChars,
      )
    : "";
  const website = clampBlock(
    formatProspectWebsiteIntelligenceForAudience(prospect.website_intelligence),
    PROSPECT_AUDIENCE_CONTEXT_LIMITS.websiteMaxChars,
  );

  // Generated listing copy is never treated as factual source material.
  // Imported GetOblic observed description is allowed through the canonical reader.
  const getoblic = readObservedListingDescription(prospect.raw_json) ?? "";

  let executive = "";
  let blueprintText = "";
  const linkedDiscussionId =
    typeof prospect.linked_discussion_id === "string" &&
    prospect.linked_discussion_id.trim()
      ? prospect.linked_discussion_id.trim()
      : null;

  if (linkedDiscussionId) {
    const getCurrentEv =
      input.deps?.getCurrentExecutiveVersion ??
      (
        await import("@/services/executiveVersions/executiveVersionService")
      ).getCurrentExecutiveVersion;

    const currentEv = await getCurrentEv(linkedDiscussionId, organizationId);
    if (currentEv?.is_current) {
      executive = formatExecutiveExcerpts(currentEv);

      let blueprint: AthenaAssetBlueprint | null =
        currentEv.intelligence?.blueprint ?? null;
      if (!blueprint && currentEv.blueprint_id) {
        const getBlueprint =
          input.deps?.getAssetBlueprintById ??
          (
            await import("@/services/assetBlueprints/assetBlueprintService")
          ).getAssetBlueprintById;
        blueprint = await getBlueprint(currentEv.blueprint_id, organizationId);
      }
      blueprintText = formatBlueprintCommercialFieldsForAudience(blueprint);
    }
  }

  const composedText = assembleProspectAudienceContextBlock({
    businessName,
    profile,
    geography,
    notes,
    painTech,
    ads,
    website,
    executive,
    blueprint: blueprintText,
    getoblic,
  });

  return {
    composedText,
    prospectId: prospect.id,
    businessName,
  };
}
