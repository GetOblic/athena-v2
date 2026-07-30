"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonaCsvImport } from "@/components/personas/PersonaCsvImport";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

const fieldClassName =
  "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

type ManualResult = {
  ok: boolean;
  message: string;
  personaId?: string;
};

const ADVANCED_GROUPS: Array<{
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

const ALL_KEYS = [
  "persona_name",
  "short_description",
  "additional_context",
  "reference_website",
  "notes",
  "ads_content",
  "category",
  ...ADVANCED_GROUPS.flatMap((group) => group.fields.map(([key]) => key)),
] as const;

export function PersonaImportForms() {
  const router = useRouter();

  const [manual, setManual] = useState<Record<string, string>>(
    Object.fromEntries(ALL_KEYS.map((key) => [key, ""])),
  );
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState<ManualResult | null>(null);

  function setField(key: string, value: string) {
    setManual((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    if (manualSubmitting) return;

    setManualSubmitting(true);
    setManualResult(null);

    try {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        message?: string;
        personaId?: string;
        error?: string | { message?: string };
      }>(response);

      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      setManualResult({
        ok: Boolean(payload.ok),
        message: payload.message || errorMessage || "Create finished.",
        personaId: payload.personaId,
      });

      if (payload.ok && payload.personaId) {
        router.push(`/personas/${payload.personaId}`);
      }
    } catch (error) {
      setManualResult({
        ok: false,
        message: error instanceof Error ? error.message : "Create failed.",
      });
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-2xl font-semibold">Manual Create</h2>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Create a single Persona. Incomplete information is fine — only a
          completely blank Persona is rejected.
        </p>

        <form onSubmit={submitManual} className="mt-8 space-y-4">
          <label className="block text-sm text-white/50">
            Persona Name
            <span className="mt-1 block text-xs leading-5 text-white/35">
              Optional working name for this clientele type or audience.
            </span>
            <input
              value={manual.persona_name ?? ""}
              onChange={(event) => setField("persona_name", event.target.value)}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Short Description
            <span className="mt-1 block text-xs leading-5 text-white/35">
              A concise summary of who this Persona represents.
            </span>
            <input
              value={manual.short_description ?? ""}
              onChange={(event) =>
                setField("short_description", event.target.value)
              }
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Additional Context
            <span className="mt-1 block text-xs leading-5 text-white/35">
              Describe everything you know or intuit about this Persona —
              patterns, motivations, contradictions, language, lifestyle,
              sensitivities, and behavior. Incomplete information is fine.
            </span>
            <textarea
              value={manual.additional_context ?? ""}
              onChange={(event) =>
                setField("additional_context", event.target.value)
              }
              rows={5}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Reference Website
            <span className="mt-1 block text-xs leading-5 text-white/35">
              Optional research URL about this segment, community, audience, or
              market. It is not assumed to be the Persona’s own website.
            </span>
            <input
              value={manual.reference_website ?? ""}
              onChange={(event) =>
                setField("reference_website", event.target.value)
              }
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Notes
            <span className="mt-1 block text-xs leading-5 text-white/35">
              Internal operator notes.
            </span>
            <textarea
              value={manual.notes ?? ""}
              onChange={(event) => setField("notes", event.target.value)}
              rows={3}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Ads Content
            <span className="mt-1 block text-xs leading-5 text-white/35">
              Paste advertising, creative, messaging, or examples that target or
              appear to resonate with this Persona.
            </span>
            <textarea
              value={manual.ads_content ?? ""}
              onChange={(event) => setField("ads_content", event.target.value)}
              rows={4}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <label className="block text-sm text-white/50">
            Category
            <input
              value={manual.category ?? ""}
              onChange={(event) => setField("category", event.target.value)}
              className={`mt-2 w-full ${fieldClassName}`}
            />
          </label>

          <div className="space-y-4 pt-2">
            {ADVANCED_GROUPS.map((group) => (
              <AthenaCollapsibleSection
                key={group.title}
                title={group.title}
                defaultOpen={false}
              >
                <div className="grid gap-4">
                  {group.fields.map(([key, label]) => (
                    <label key={key} className="block text-sm text-white/50">
                      {label}
                      <input
                        value={manual[key] ?? ""}
                        onChange={(event) => setField(key, event.target.value)}
                        className={`mt-2 w-full ${fieldClassName}`}
                      />
                    </label>
                  ))}
                </div>
              </AthenaCollapsibleSection>
            ))}
          </div>

          <button
            type="submit"
            disabled={manualSubmitting}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {manualSubmitting ? "Creating…" : "Create Persona"}
          </button>
        </form>

        {manualResult && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 whitespace-pre-wrap">
            {manualResult.message}
            {manualResult.personaId && (
              <div className="mt-3">
                <Link
                  href={`/personas/${manualResult.personaId}`}
                  className="text-[var(--athena-orange)] underline"
                >
                  Open Persona
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      <PersonaCsvImport />
    </div>
  );
}
