"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { normalizeWebsiteUrl } from "@/services/personas/personaUtils";
import type { Persona } from "@/services/personas/personaService";

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none";

type PersonaMetadataEditorProps = {
  persona: Persona;
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

function ExternalValueLink({ value }: { value: string }) {
  const href = normalizeWebsiteUrl(value);
  if (!href) {
    return <span className="text-white/75">{value || "—"}</span>;
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
}: PersonaMetadataEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(() => formFromPersona(persona));
  const [savedForm, setSavedForm] = useState(() => formFromPersona(persona));
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function beginEdit() {
    setForm(savedForm);
    setIsEditing(true);
    setShowDeleteConfirm(false);
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
        setError(errorMessage || "Save failed.");
        return;
      }

      const nextSaved = { ...form };
      setSavedForm(nextSaved);
      setForm(nextSaved);
      setIsEditing(false);
      setMessage(payload.message || "Persona metadata saved.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/personas/${persona.id}`, {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: string | { message?: string };
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok) {
        throw new Error(errorMessage || "Failed to delete persona.");
      }

      router.push("/personas");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete persona.",
      );
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const display = isEditing ? form : savedForm;

  return (
    <AthenaCollapsibleSection
      title={isEditing ? "Edit metadata" : "Persona Details"}
      eyebrow="Persona Details"
      defaultOpen
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="max-w-2xl text-sm text-white/40">
            {isEditing
              ? "Update Persona metadata. Changes are saved immediately and do not trigger generation."
              : "Review Persona fields in read-only mode. Edit to update source data."}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex flex-wrap justify-end gap-3">
            {!isEditing ? (
              <button
                type="button"
                onClick={beginEdit}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
              >
                Edit metadata
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(true);
                setError(null);
              }}
              className="rounded-full border border-red-500/30 px-5 py-3 text-sm font-semibold text-red-300 transition hover:border-red-400/50 hover:text-red-200"
            >
              Delete
            </button>
          </div>

          {showDeleteConfirm && (
            <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-black/30 p-5 sm:text-right">
              <p className="text-sm leading-6 text-white/70">
                Delete this Persona permanently? The Persona record will be
                removed. This cannot be undone.
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <>
          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/35">
                {group.title}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.fields.map(([key, label]) => (
                  <label key={key} className="block text-sm text-white/45">
                    {label}
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
                {label}
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
                  {group.title}
                </h3>
                <dl className="mt-4 grid gap-4 md:grid-cols-2">
                  {filled.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs uppercase tracking-[0.14em] text-white/35">
                        {label}
                      </dt>
                      <dd className="mt-2 text-sm leading-6 text-white/75">
                        {key === "reference_website" ? (
                          <ExternalValueLink value={display[key]} />
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
                  {label}
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
