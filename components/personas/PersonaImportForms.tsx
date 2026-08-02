"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonaCsvImport } from "@/components/personas/PersonaCsvImport";
import { PersonaGenerateForm } from "@/components/personas/PersonaGenerateForm";
import {
  emptyPersonaFormState,
  PERSONA_ADVANCED_FIELD_GROUPS,
  PERSONA_FORM_FIELD_CLASS,
} from "@/components/personas/personaFormFields";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type ManualResult = {
  ok: boolean;
  message: string;
  personaId?: string;
};

export function PersonaImportForms() {
  const router = useRouter();

  const [manual, setManual] = useState<Record<string, string>>(
    emptyPersonaFormState,
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
        queued?: boolean;
        queueError?: string | null;
        error?: string | { message?: string };
      }>(response);

      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      const warning =
        payload.ok && payload.personaId && payload.queued === false
          ? payload.queueError ||
            "Persona was created, but intelligence generation must be retried from the detail page."
          : null;

      setManualResult({
        ok: Boolean(payload.ok),
        message:
          warning ||
          payload.message ||
          errorMessage ||
          "Create finished.",
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
    <div className="space-y-8">
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
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
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
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
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
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
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
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
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
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
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
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              Category
              <input
                value={manual.category ?? ""}
                onChange={(event) => setField("category", event.target.value)}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <div className="space-y-4 pt-2">
              {PERSONA_ADVANCED_FIELD_GROUPS.map((group) => (
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
                          className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
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

      <PersonaGenerateForm />
    </div>
  );
}
