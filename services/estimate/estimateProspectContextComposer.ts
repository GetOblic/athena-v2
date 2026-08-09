/**
 * Athena Estimate Prospect commercial-target context composer (V27 L15).
 *
 * Operates only for Prospect-targeted Estimates.
 * Re-fetches the Prospect with the Estimate's organization_id (fail closed).
 * Composes a bounded PROSPECT COMMERCIAL TARGET INTELLIGENCE block for the
 * same V26 Estimate generation pipeline — does not alter organization context.
 *
 * Org-only Estimates must never call this composer.
 */

import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import {
  ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
  ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION,
  type EstimateProspectGenerationContextV1,
} from "@/services/estimate/athenaEstimateTypes";
import { validateEstimateProspectGenerationContext } from "@/services/estimate/athenaEstimateProspectContext";
import type { ExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionTypes";
import type { Prospect } from "@/services/prospects/prospectService";
import {
  deepIntelligenceHasUsableContent,
  formatDeepIntelligenceForBrainPrompt,
  isDeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

/** Deterministic L15 Prospect block budgets (org context budgets unchanged). */
export const ESTIMATE_PROSPECT_CONTEXT_LIMITS = {
  profileMaxChars: 2_000,
  notesMaxChars: 2_500,
  adsMaxChars: 1_000,
  websiteMaxChars: 5_000,
  executiveMaxChars: 3_000,
  blueprintMaxChars: 1_500,
  blockHardCap: ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
  fieldTruncate: 220,
} as const;

export const ESTIMATE_PROSPECT_COMMERCIAL_TARGET_HEADER =
  "PROSPECT COMMERCIAL TARGET INTELLIGENCE" as const;

export class EstimateProspectContextCompositionError extends Error {
  readonly code = "PROSPECT_TARGET_UNAVAILABLE";
  readonly retryable = false;

  constructor(
    message = "Prospect target is unavailable for Estimate generation.",
  ) {
    super(message);
    this.name = "EstimateProspectContextCompositionError";
  }
}

export type ComposeEstimateProspectContextDeps = {
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

export type ComposeEstimateProspectContextResult = {
  /** Exact Prospect block supplied to generation (frozen as composedText). */
  composedText: string;
  /** Validated Ready freeze contract. */
  frozenContext: EstimateProspectGenerationContextV1;
};

type SectionKey =
  | "header"
  | "profile"
  | "notes"
  | "painTech"
  | "ads"
  | "website"
  | "executive"
  | "blueprint";

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

function fieldLine(label: string, value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${label}: ${truncateText(trimmed, ESTIMATE_PROSPECT_CONTEXT_LIMITS.fieldTruncate)}`;
}

function joinLines(lines: Array<string | null>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

/**
 * Bounded textual website intelligence — never blind JSON dump.
 * Skips contact_information (not approved pricing evidence).
 */
export function formatProspectWebsiteIntelligenceForEstimate(
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

  const skipKeys = new Set([
    "contact_information",
    "error",
    "email",
    "phone",
    "whatsapp_number",
  ]);

  const lines: string[] = [];
  for (const [key, value] of Object.entries(websiteIntelligence)) {
    if (skipKeys.has(key)) continue;
    if (typeof value === "string" && value.trim()) {
      lines.push(
        `${key}:\n${truncateText(value, ESTIMATE_PROSPECT_CONTEXT_LIMITS.fieldTruncate * 4)}`,
      );
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = Object.entries(value as Record<string, unknown>)
        .filter(
          ([k, v]) =>
            !skipKeys.has(k) &&
            typeof v === "string" &&
            String(v).trim().length > 0,
        )
        .map(
          ([k, v]) =>
            `${k}: ${truncateText(String(v), ESTIMATE_PROSPECT_CONTEXT_LIMITS.fieldTruncate)}`,
        )
        .join("\n");
      if (nested) {
        lines.push(`${key}:\n${nested}`);
      }
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
    fieldLine("address", prospect.address),
    fieldLine("city", prospect.city),
    fieldLine("state", prospect.state),
    fieldLine("country", prospect.country),
    fieldLine("company_size", prospect.company_size),
    fieldLine("revenue", prospect.revenue),
    fieldLine("employee_count", prospect.employee_count),
    fieldLine("decision_maker", prospect.decision_maker),
    fieldLine("job_title", prospect.job_title),
  ]);
}

function formatNotesSection(prospect: Prospect): string {
  const parts: string[] = [];
  if (prospect.notes?.trim()) {
    parts.push(
      `notes:\n${truncateText(prospect.notes, ESTIMATE_PROSPECT_CONTEXT_LIMITS.notesMaxChars)}`,
    );
  }
  if (prospect.additional_context?.trim()) {
    parts.push(
      `additional_context:\n${truncateText(
        prospect.additional_context,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.notesMaxChars,
      )}`,
    );
  }
  return clampBlock(
    parts.join("\n\n"),
    ESTIMATE_PROSPECT_CONTEXT_LIMITS.notesMaxChars,
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
      fieldLine("risk_level", analysis.risk_level),
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
    ESTIMATE_PROSPECT_CONTEXT_LIMITS.executiveMaxChars,
  );
}

/** Commercial blueprint fields only — creative prompt payloads excluded. */
export function formatBlueprintCommercialFieldsForEstimate(
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
    ESTIMATE_PROSPECT_CONTEXT_LIMITS.blueprintMaxChars,
  );
}

function renderSection(section: BuiltSection): string {
  if (section.key === "header") {
    return section.body;
  }
  return `${section.title}\n${section.body}`;
}

/**
 * Hard-cap assembly: lower-priority sections yield first.
 * Never drops the header / business_name identity line.
 */
export function assembleProspectCommercialTargetBlock(input: {
  businessName: string;
  prospectId: string;
  profile: string;
  notes: string;
  painTech: string;
  ads: string;
  website: string;
  executive: string;
  blueprint: string;
}): {
  composedText: string;
  available: EstimateProspectGenerationContextV1["available"];
} {
  const headerBody = [
    ESTIMATE_PROSPECT_COMMERCIAL_TARGET_HEADER,
    "(Trusted Athena evidence about the commercial target for whom this Estimate is being prepared.",
    "Supplements — does not replace — organization trusted evidence. Not operator guidance or pricing methodology.)",
    `prospect_id: ${input.prospectId}`,
    `business_name: ${input.businessName.trim()}`,
  ].join("\n");

  const sections: BuiltSection[] = [
    { key: "header", title: "", body: headerBody },
  ];

  const profile = clampBlock(
    input.profile,
    ESTIMATE_PROSPECT_CONTEXT_LIMITS.profileMaxChars,
  );
  if (profile) {
    sections.push({
      key: "profile",
      title: "Prospect profile / company / geography",
      body: profile,
    });
  }

  if (input.notes.trim()) {
    sections.push({
      key: "notes",
      title: "Prospect commercial notes",
      body: clampBlock(
        input.notes,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.notesMaxChars,
      ),
    });
  }

  if (input.painTech.trim()) {
    sections.push({
      key: "painTech",
      title: "Prospect pain points / technologies",
      body: clampBlock(
        input.painTech,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.profileMaxChars,
      ),
    });
  }

  if (input.ads.trim()) {
    sections.push({
      key: "ads",
      title: "Prospect ads content",
      body: clampBlock(input.ads, ESTIMATE_PROSPECT_CONTEXT_LIMITS.adsMaxChars),
    });
  }

  if (input.website.trim()) {
    sections.push({
      key: "website",
      title: "Prospect website intelligence",
      body: clampBlock(
        input.website,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.websiteMaxChars,
      ),
    });
  }

  if (input.executive.trim()) {
    sections.push({
      key: "executive",
      title: "Current Executive Intelligence",
      body: clampBlock(
        input.executive,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.executiveMaxChars,
      ),
    });
  }

  if (input.blueprint.trim()) {
    sections.push({
      key: "blueprint",
      title: "Strategic Asset Blueprint (commercial fields)",
      body: clampBlock(
        input.blueprint,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.blueprintMaxChars,
      ),
    });
  }

  // Drop lowest-priority sections first when over hard cap.
  const dropOrder: SectionKey[] = [
    "blueprint",
    "executive",
    "website",
    "ads",
    "painTech",
    "notes",
    "profile",
  ];

  const active = [...sections];
  const joinActive = () =>
    active.map(renderSection).filter(Boolean).join("\n\n");

  let composed = joinActive();
  for (const key of dropOrder) {
    if (composed.length <= ESTIMATE_PROSPECT_CONTEXT_LIMITS.blockHardCap) {
      break;
    }
    const idx = active.findIndex((section) => section.key === key);
    if (idx <= 0) continue; // never drop header
    const section = active[idx]!;
    const overflow =
      composed.length - ESTIMATE_PROSPECT_CONTEXT_LIMITS.blockHardCap;
    const keepBody = Math.max(
      0,
      section.body.length - overflow - 1,
    );
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

  if (composed.length > ESTIMATE_PROSPECT_CONTEXT_LIMITS.blockHardCap) {
    // Final deterministic clamp — preserve leading identity header.
    composed = clampBlock(
      composed,
      ESTIMATE_PROSPECT_CONTEXT_LIMITS.blockHardCap,
    );
  }

  // Ensure business_name survives even after hard clamp.
  if (!composed.includes(`business_name: ${input.businessName.trim()}`)) {
    const identity = `business_name: ${input.businessName.trim()}`;
    composed = clampBlock(
      `${headerBody}\n${identity}`,
      ESTIMATE_PROSPECT_CONTEXT_LIMITS.blockHardCap,
    );
  }

  const keys = new Set(active.map((section) => section.key));
  return {
    composedText: composed,
    available: {
      profile: keys.has("profile") || composed.includes("business_name:"),
      notesOrAdditionalContext: keys.has("notes"),
      adsContent: keys.has("ads"),
      websiteIntelligence: keys.has("website"),
      executiveIntelligence: keys.has("executive"),
      strategicAssetBlueprint: keys.has("blueprint"),
    },
  };
}

/**
 * Compose bounded Prospect commercial-target intelligence for Estimate generation.
 * Fail closed when Prospect is missing, wrong-org, or lacks business_name.
 */
export async function composeEstimateProspectGenerationContext(input: {
  prospectId: string;
  organizationId: string;
  capturedAt?: string;
  deps?: ComposeEstimateProspectContextDeps;
}): Promise<ComposeEstimateProspectContextResult> {
  const prospectId = input.prospectId.trim();
  const organizationId = input.organizationId.trim();
  if (!prospectId || !organizationId) {
    throw new EstimateProspectContextCompositionError();
  }

  const getProspect =
    input.deps?.getProspectById ??
    (await import("@/services/prospects/prospectService")).getProspectById;

  const prospect = await getProspect(prospectId, organizationId);
  if (!prospect) {
    throw new EstimateProspectContextCompositionError();
  }

  const businessName =
    typeof prospect.business_name === "string"
      ? prospect.business_name.trim()
      : "";
  if (!businessName) {
    throw new EstimateProspectContextCompositionError(
      "Prospect business name is required for Estimate generation.",
    );
  }

  // Explicit PII / non-approved fields must never enter composition.
  // (email, phone, whatsapp_number, first_name, last_name, external_contact_id)

  const profile = formatProfileSection(prospect);
  const notes = formatNotesSection(prospect);
  const painTech = formatPainTechSection(prospect);
  const ads = prospect.ads_content?.trim()
    ? truncateText(
        prospect.ads_content,
        ESTIMATE_PROSPECT_CONTEXT_LIMITS.adsMaxChars,
      )
    : "";
  const website = clampBlock(
    formatProspectWebsiteIntelligenceForEstimate(prospect.website_intelligence),
    ESTIMATE_PROSPECT_CONTEXT_LIMITS.websiteMaxChars,
  );

  let executive = "";
  const linkedDiscussionId: string | null =
    typeof prospect.linked_discussion_id === "string" &&
    prospect.linked_discussion_id.trim()
      ? prospect.linked_discussion_id.trim()
      : null;
  let executiveVersionId: string | null = null;
  let blueprintText = "";

  if (linkedDiscussionId) {
    const getCurrentEv =
      input.deps?.getCurrentExecutiveVersion ??
      (
        await import(
          "@/services/executiveVersions/executiveVersionService"
        )
      ).getCurrentExecutiveVersion;

    const currentEv = await getCurrentEv(linkedDiscussionId, organizationId);
    if (currentEv?.is_current) {
      executiveVersionId = currentEv.id;
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
      blueprintText = formatBlueprintCommercialFieldsForEstimate(blueprint);
    }
  }

  const { composedText, available } = assembleProspectCommercialTargetBlock({
    businessName,
    prospectId: prospect.id,
    profile,
    notes,
    painTech,
    ads,
    website,
    executive,
    blueprint: blueprintText,
  });

  const frozenContext = validateEstimateProspectGenerationContext({
    schemaVersion: ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION,
    prospectId: prospect.id,
    businessName,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    composedText,
    available,
    sources: {
      linkedDiscussionId,
      executiveVersionId,
    },
  });

  return { composedText, frozenContext };
}
