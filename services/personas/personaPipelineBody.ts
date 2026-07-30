/**
 * Normalized Executive Intelligence input for Persona sources.
 * Serializes the current Persona profile into the bridge Discussion body.
 */

import {
  normalizeOptionalText,
  resolvePersonaDisplayLabel,
} from "@/services/personas/personaUtils";
import {
  deepIntelligenceHasUsableContent,
  formatDeepIntelligenceForBrainPrompt,
  isDeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

type PersonaPipelineTextSnapshot = {
  persona_name?: string | null;
  short_description?: string | null;
  category?: string | null;
  gender_identity?: string | null;
  age_range?: string | null;
  birth_year_approx?: string | null;
  generation?: string | null;
  cultural_background?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  location_summary?: string | null;
  languages?: string | null;
  relationship_status?: string | null;
  household?: string | null;
  income_range?: string | null;
  purchasing_power?: string | null;
  education?: string | null;
  occupation?: string | null;
  seniority?: string | null;
  industry_context?: string | null;
  lifestyle?: string | null;
  interests?: string | null;
  digital_behavior?: string | null;
  brands_influences?: string | null;
  values_text?: string | null;
  aesthetic_preferences?: string | null;
  preferred_imagery?: string | null;
  goals?: string | null;
  needs?: string | null;
  pain_points?: string | null;
  fears?: string | null;
  motivations?: string | null;
  objections?: string | null;
  buying_triggers?: string | null;
  decision_criteria?: string | null;
  purchase_behavior?: string | null;
  typical_concerns?: string | null;
  communication_style?: string | null;
  preferred_channels?: string | null;
  reference_website?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  ads_content?: string | null;
};

export type PersonaPipelineFieldSnapshot = PersonaPipelineTextSnapshot & {
  reference_website_intelligence?: Record<string, unknown> | null;
};

/**
 * Format successful Reference Website research for the Persona pipeline body.
 * Omits worker diagnostics, stack traces, and raw crawl metadata.
 */
export function formatPersonaReferenceWebsiteResearchEvidence(
  referenceWebsite: string | null | undefined,
  intelligence: Record<string, unknown> | null | undefined,
): string | null {
  const website = normalizeOptionalText(referenceWebsite);
  if (!website || !intelligence || typeof intelligence !== "object") {
    return null;
  }

  let scrapedContent = "";
  if (
    isDeepWebsiteIntelligence(intelligence) &&
    deepIntelligenceHasUsableContent(intelligence)
  ) {
    scrapedContent = formatDeepIntelligenceForBrainPrompt(intelligence).trim();
  } else {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(intelligence)) {
      if (
        key === "crawl_summary" ||
        key === "pages" ||
        key === "error" ||
        key === "error_code" ||
        key === "error_message" ||
        key === "stack" ||
        key === "diagnostics"
      ) {
        continue;
      }
      if (typeof value === "string" && value.trim()) {
        lines.push(`${key}:\n${value.trim()}`);
      }
    }
    scrapedContent = lines.join("\n\n").trim();
  }

  if (!scrapedContent) return null;

  return [
    "=== REFERENCE WEBSITE RESEARCH — EXTERNAL CONTEXTUAL EVIDENCE ===",
    `Source URL: ${website}`,
    "",
    scrapedContent,
    "",
    "EVIDENCE LIMIT:",
    "This content comes from a contextual reference source. It is not automatically owned by the Persona and must not be treated as representative of every person in the segment.",
  ].join("\n");
}

function fieldLine(label: string, value?: string | null): string | null {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) return null;
  if (trimmed.includes("\n")) {
    return `${label}:\n${trimmed}`;
  }
  return `${label}: ${trimmed}`;
}

const IMPORTANT_EMPTY_SECTIONS: Array<{
  label: string;
  keys: Array<keyof PersonaPipelineTextSnapshot>;
}> = [
  {
    label: "Identity and demographics",
    keys: [
      "persona_name",
      "short_description",
      "category",
      "gender_identity",
      "age_range",
      "birth_year_approx",
      "generation",
      "cultural_background",
    ],
  },
  {
    label: "Geography and language",
    keys: ["country", "state", "city", "location_summary", "languages"],
  },
  {
    label: "Needs, fears, pain points, and motivations",
    keys: ["goals", "needs", "pain_points", "fears", "motivations"],
  },
  {
    label: "Objections and buying behavior",
    keys: [
      "objections",
      "buying_triggers",
      "decision_criteria",
      "purchase_behavior",
      "typical_concerns",
    ],
  },
  {
    label: "Additional Context",
    keys: ["additional_context"],
  },
  {
    label: "Reference Website",
    keys: ["reference_website"],
  },
];

function missingSections(persona: PersonaPipelineTextSnapshot): string[] {
  const missing: string[] = [];
  for (const section of IMPORTANT_EMPTY_SECTIONS) {
    const hasAny = section.keys.some((key) =>
      Boolean(normalizeOptionalText(persona[key])),
    );
    if (!hasAny) missing.push(section.label);
  }
  return missing;
}

/**
 * Serialize current Persona data into a deterministic bridge Discussion body.
 * Omits blank fields, internal ownership IDs, and raw JSON dumps.
 */
export function formatNormalizedPersonaInputForPipeline(
  persona: PersonaPipelineFieldSnapshot,
): string {
  const label = resolvePersonaDisplayLabel(persona);
  const structuredFields = [
    fieldLine("Persona Name", persona.persona_name),
    fieldLine("Short Description", persona.short_description),
    fieldLine("Category", persona.category),
    fieldLine("Gender Identity", persona.gender_identity),
    fieldLine("Age Range", persona.age_range),
    fieldLine("Approximate Birth Year", persona.birth_year_approx),
    fieldLine("Generation", persona.generation),
    fieldLine("Cultural Background", persona.cultural_background),
    fieldLine("Country", persona.country),
    fieldLine("State or Region", persona.state),
    fieldLine("City", persona.city),
    fieldLine("Location Summary", persona.location_summary),
    fieldLine("Languages", persona.languages),
    fieldLine("Relationship Status", persona.relationship_status),
    fieldLine("Household", persona.household),
    fieldLine("Income Range", persona.income_range),
    fieldLine("Purchasing Power", persona.purchasing_power),
    fieldLine("Education", persona.education),
    fieldLine("Occupation", persona.occupation),
    fieldLine("Seniority", persona.seniority),
    fieldLine("Industry Context", persona.industry_context),
    fieldLine("Lifestyle", persona.lifestyle),
    fieldLine("Interests", persona.interests),
    fieldLine("Digital Behavior", persona.digital_behavior),
    fieldLine("Brands or Influences", persona.brands_influences),
    fieldLine("Values", persona.values_text),
    fieldLine("Aesthetic Preferences", persona.aesthetic_preferences),
    fieldLine("Preferred Imagery", persona.preferred_imagery),
    fieldLine("Goals", persona.goals),
    fieldLine("Needs", persona.needs),
    fieldLine("Pain Points", persona.pain_points),
    fieldLine("Fears", persona.fears),
    fieldLine("Motivations", persona.motivations),
    fieldLine("Objections", persona.objections),
    fieldLine("Buying Triggers", persona.buying_triggers),
    fieldLine("Decision Criteria", persona.decision_criteria),
    fieldLine("Purchase Behavior", persona.purchase_behavior),
    fieldLine("Typical Concerns", persona.typical_concerns),
    fieldLine("Communication Style", persona.communication_style),
    fieldLine("Preferred Channels", persona.preferred_channels),
  ].filter((entry): entry is string => Boolean(entry));

  const lines: string[] = [
    "EXECUTIVE INTELLIGENCE SOURCE: PERSONA",
    "",
    "EVIDENCE DISCIPLINE:",
    "This source describes a clientele archetype or audience segment, not one identifiable business lead or one universally representative individual.",
    "",
    "PERSONA:",
    label,
    "",
    "=== STRUCTURED PERSONA PROFILE — USER-PROVIDED ===",
    "Only include fields with values.",
    "Do not fabricate missing fields.",
  ];

  if (structuredFields.length > 0) {
    lines.push(...structuredFields);
  }

  lines.push("");

  const additional = normalizeOptionalText(persona.additional_context);
  if (additional) {
    lines.push("=== ADDITIONAL CONTEXT — PRIMARY USER UNDERSTANDING ===");
    lines.push(additional);
    lines.push("");
    lines.push(
      "This section may contain user observations, intuition, assumptions, and recurring patterns. Treat it as important evidence while distinguishing it from independently verified fact.",
    );
    lines.push("");
  }

  const notes = normalizeOptionalText(persona.notes);
  if (notes) {
    lines.push("=== NOTES — OPERATOR CONTEXT ===");
    lines.push(notes);
    lines.push("");
  }

  const ads = normalizeOptionalText(persona.ads_content);
  if (ads) {
    lines.push("=== ADS CONTENT — OBSERVED OR PROPOSED CREATIVE ===");
    lines.push(ads);
    lines.push("");
  }

  const website = normalizeOptionalText(persona.reference_website);
  if (website) {
    lines.push("=== REFERENCE WEBSITE ===");
    lines.push(`URL: ${website}`);
    lines.push("");
    lines.push(
      "The URL is a contextual reference source. It is not automatically owned by the Persona and is not necessarily representative of every person in the segment.",
    );
    lines.push("");
  }

  const research = formatPersonaReferenceWebsiteResearchEvidence(
    persona.reference_website,
    persona.reference_website_intelligence,
  );
  if (research) {
    lines.push(research);
    lines.push("");
  }

  const missing = missingSections(persona);
  lines.push("=== MISSING OR UNKNOWN AREAS ===");
  if (missing.length === 0) {
    lines.push("Not provided");
  } else {
    for (const section of missing) {
      lines.push(`- ${section}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

/** Build bridge body from a Persona record. */
export function buildPersonaAnalysisBody(
  persona: PersonaPipelineFieldSnapshot,
): string {
  return formatNormalizedPersonaInputForPipeline(persona);
}
