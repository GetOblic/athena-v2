/**
 * Shared Manual Create / Generate Persona field definitions.
 * Keeps labels and coverage aligned across import paths.
 */

export const PERSONA_FORM_FIELD_CLASS =
  "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

export const PERSONA_ADVANCED_FIELD_GROUPS: Array<{
  title: string;
  fields: Array<[string, string]>;
}> = [
  {
    title: "Demographics",
    fields: [
      ["gender_identity", "Gender or Gender Identity"],
      ["age_range", "Age Range"],
      ["birth_year_approx", "Approximate Birth Year"],
      ["generation", "Generation"],
      ["cultural_background", "Cultural Background"],
    ],
  },
  {
    title: "Geography and Language",
    fields: [
      ["country", "Country"],
      ["state", "State or Region"],
      ["city", "City"],
      ["location_summary", "Location Summary"],
      ["languages", "Languages"],
    ],
  },
  {
    title: "Family and Household",
    fields: [
      ["relationship_status", "Relationship Status"],
      ["household", "Household or Children"],
    ],
  },
  {
    title: "Financial Profile",
    fields: [
      ["income_range", "Income Range"],
      ["purchasing_power", "Purchasing Power or Assets"],
    ],
  },
  {
    title: "Education and Professional Context",
    fields: [
      ["education", "Education"],
      ["occupation", "Occupation"],
      ["seniority", "Professional Seniority"],
      ["industry_context", "Industry Context"],
    ],
  },
  {
    title: "Lifestyle and Behavior",
    fields: [
      ["lifestyle", "Lifestyle"],
      ["interests", "Interests"],
      ["digital_behavior", "Digital Behavior"],
      ["brands_influences", "Brands or Influences"],
    ],
  },
  {
    title: "Values and Aesthetics",
    fields: [
      ["values_text", "Values"],
      ["aesthetic_preferences", "Aesthetic Preferences"],
      ["preferred_imagery", "Preferred Imagery"],
    ],
  },
  {
    title: "Needs and Motivations",
    fields: [
      ["goals", "Goals"],
      ["needs", "Needs"],
      ["pain_points", "Pain Points"],
      ["fears", "Fears"],
      ["motivations", "Motivations"],
    ],
  },
  {
    title: "Buying Behavior",
    fields: [
      ["objections", "Objections"],
      ["buying_triggers", "Buying Triggers"],
      ["decision_criteria", "Decision Criteria"],
      ["purchase_behavior", "Purchase Behavior"],
      ["typical_concerns", "Typical Concerns or Questions"],
    ],
  },
  {
    title: "Communication",
    fields: [
      ["communication_style", "Communication Style"],
      ["preferred_channels", "Preferred Channels"],
    ],
  },
];

export const PERSONA_FORM_KEYS = [
  "persona_name",
  "short_description",
  "additional_context",
  "reference_website",
  "notes",
  "ads_content",
  "category",
  ...PERSONA_ADVANCED_FIELD_GROUPS.flatMap((group) =>
    group.fields.map(([key]) => key),
  ),
] as const;

export type PersonaFormKey = (typeof PERSONA_FORM_KEYS)[number];

export function emptyPersonaFormState(): Record<string, string> {
  return Object.fromEntries(PERSONA_FORM_KEYS.map((key) => [key, ""]));
}

export function personaCandidateToFormState(
  candidate: Record<string, string | null | undefined>,
): Record<string, string> {
  const next = emptyPersonaFormState();
  for (const key of PERSONA_FORM_KEYS) {
    const value = candidate[key];
    next[key] = typeof value === "string" ? value : "";
  }
  return next;
}
