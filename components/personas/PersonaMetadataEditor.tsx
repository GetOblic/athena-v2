"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { normalizeWebsiteUrl } from "@/services/personas/personaUtils";
import type { Persona } from "@/services/personas/personaService";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type PersonaMetadataChrome = TenantMessages["personas"]["metadata"];

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none";

type PersonaMetadataEditorProps = {
  persona: Persona;
  chrome?: PersonaMetadataChrome | null;
  emptyValue?: string;
};

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<[string, string]>;
}> = [
  {
    title: "Identity",
    fields: [
      ["persona_name", "Persona Name"],
      ["short_description", "Short Description"],
      ["category", "Category"],
    ],
  },
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
    title: "Family and Financial Context",
    fields: [
      ["relationship_status", "Relationship Status"],
      ["household", "Household or Children"],
      ["income_range", "Income Range"],
      ["purchasing_power", "Purchasing Power or Assets"],
    ],
  },
  {
    title: "Professional Context",
    fields: [
      ["education", "Education"],
      ["occupation", "Occupation"],
      ["seniority", "Professional Seniority"],
      ["industry_context", "Industry Context"],
    ],
  },
  {
    title: "Lifestyle and Values",
    fields: [
      ["lifestyle", "Lifestyle"],
      ["interests", "Interests"],
      ["digital_behavior", "Digital Behavior"],
      ["brands_influences", "Brands or Influences"],
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
  {
    title: "Reference Research",
    fields: [["reference_website", "Reference Website"]],
  },
];

const LONG_TEXT_FIELDS = [
  ["additional_context", "Additional Context"],
  ["notes", "Notes"],
  ["ads_content", "Ads Content"],
] as const;

const GROUP_CHROME_KEYS: Record<string, keyof PersonaMetadataChrome> = {
  Identity: "groupIdentity",
  Demographics: "groupDemographics",
  "Geography and Language": "groupGeography",
  "Family and Financial Context": "groupFamily",
  "Professional Context": "groupProfessional",
  "Lifestyle and Values": "groupLifestyle",
  "Needs and Motivations": "groupNeeds",
  "Buying Behavior": "groupBuying",
  Communication: "groupCommunication",
  "Reference Research": "groupResearch",
};

const FIELD_CHROME_KEYS: Record<string, keyof PersonaMetadataChrome> = {
  persona_name: "personaName",
  short_description: "shortDescription",
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
  reference_website: "referenceWebsite",
  additional_context: "additionalContext",
  notes: "notes",
  ads_content: "adsContent",
};

function chromeLabel(
  chrome: PersonaMetadataChrome | null | undefined,
  key: string,
  fallback: string,
): string {
  const mapped = FIELD_CHROME_KEYS[key] ?? GROUP_CHROME_KEYS[key];
  if (!chrome || !mapped) return fallback;
  const value = chrome[mapped];
  return typeof value === "string" ? value : fallback;
}

type FormState = Record<string, string>;

function formFromPersona(persona: Persona): FormState {
  const source = persona as unknown as Record<string, unknown>;
  const form: FormState = {};
  for (const group of FIELD_GROUPS) {
    for (const [key] of group.fields) {
      form[key] = String(source[key] ?? "");
    }
  }
  for (const [key] of LONG_TEXT_FIELDS) {
    form[key] = String(source[key] ?? "");
  }
  return form;
}

function ExternalValueLink({
  value,
  emptyValue,
}: {
  value: string;
  emptyValue: string;
}) {
  const href = normalizeWebsiteUrl(value);
  if (!href) {
    return <span className="text-white/75">{value || emptyValue}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--athena-orange)] underline underline-offset-2"
    >
      {value}
    </a>
  );
}

export function PersonaMetadataEditor({
  persona,
  chrome = null,
  emptyValue = "—",
}: PersonaMetadataEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(() => formFromPersona(persona));
  const [savedForm, setSavedForm] = useState(() => formFromPersona(persona));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function beginEdit() {
    setForm(savedForm);
    setIsEditing(true);
    setMessage(null);
    setError(null);
  }

  function cancelEdit() {
    setForm(savedForm);
    setIsEditing(false);
    setMessage(null);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/personas/${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: string | { message?: string };
        message?: string;
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok) {
        setError(errorMessage || (chrome?.saveFailed ?? "Save failed."));
        return;
      }

      const nextSaved = { ...form };
      setSavedForm(nextSaved);
      setForm(nextSaved);
      setIsEditing(false);
      setMessage(payload.message || (chrome?.saved ?? "Persona metadata saved."));
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : (chrome?.saveFailed ?? "Save failed."),
      );
    } finally {
      setSaving(false);
    }
  }

  const display = isEditing ? form : savedForm;

  return (
    <AthenaCollapsibleSection
      title={
        isEditing
          ? (chrome?.titleEdit ?? "Edit metadata")
          : (chrome?.title ?? "Persona Details")
      }
      eyebrow={chrome?.eyebrow ?? "Persona Details"}
      defaultOpen={false}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="max-w-2xl text-sm text-white/40">
            {isEditing
              ? (chrome?.helpEdit ??
                "Update Persona metadata. Changes are saved immediately and do not trigger generation.")
              : (chrome?.helpRead ??
                "Review Persona fields in read-only mode. Edit to update source data.")}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          {!isEditing ? (
            <button
              type="button"
              onClick={beginEdit}
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
            >
              {chrome?.edit ?? "Edit metadata"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 disabled:opacity-40"
              >
                {chrome?.cancel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving
                  ? (chrome?.saving ?? "Saving…")
                  : (chrome?.save ?? "Save")}
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <>
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/35">
                {chromeLabel(chrome, group.title, group.title)}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.fields.map(([key, label]) => (
                  <label key={key} className="block text-sm text-white/45">
                    {chromeLabel(chrome, key, label)}
                    <input
                      value={form[key] ?? ""}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                      className={`mt-2 ${fieldClassName}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-8 space-y-4">
            {LONG_TEXT_FIELDS.map(([key, label]) => (
              <label key={key} className="block text-sm text-white/45">
                {chromeLabel(chrome, key, label)}
                <textarea
                  value={form[key] ?? ""}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                  rows={key === "additional_context" ? 6 : 4}
                  className={`mt-2 ${fieldClassName}`}
                />
              </label>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-8 space-y-8">
          {FIELD_GROUPS.map((group) => {
            const filled = group.fields.filter(([key]) =>
              String(display[key] ?? "").trim(),
            );
            if (filled.length === 0) return null;
            return (
              <div key={group.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/35">
                  {chromeLabel(chrome, group.title, group.title)}
                </h3>
                <dl className="mt-4 grid gap-4 md:grid-cols-2">
                  {filled.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                        {chromeLabel(chrome, key, label)}
                      </dt>
                      <dd className="mt-2 text-sm leading-6 text-white/75">
                        {key === "reference_website" ? (
                          <ExternalValueLink
                            value={display[key]}
                            emptyValue={emptyValue}
                          />
                        ) : (
                          display[key]
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}

          {LONG_TEXT_FIELDS.map(([key, label]) => {
            const value = String(display[key] ?? "").trim();
            if (!value) return null;
            return (
              <div key={key}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/35">
                  {chromeLabel(chrome, key, label)}
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/70">
                  {value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {message && (
        <div className="mt-6 text-sm text-emerald-300">{message}</div>
      )}
      {error && <div className="mt-6 text-sm text-red-300">{error}</div>}
    </AthenaCollapsibleSection>
  );
}
