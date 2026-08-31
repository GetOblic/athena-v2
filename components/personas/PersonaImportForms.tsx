"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonaCreationBlock } from "@/components/personas/PersonaCreationBlock";
import { PersonaCsvImport } from "@/components/personas/PersonaCsvImport";
import { PersonaGenerateForm } from "@/components/personas/PersonaGenerateForm";
import {
  emptyPersonaFormState,
  PERSONA_ADVANCED_FIELD_GROUPS,
  PERSONA_FORM_FIELD_CLASS,
} from "@/components/personas/personaFormFields";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  getLocalizedPersonaImportFieldLabel,
  getLocalizedPersonaImportGroupTitle,
} from "@/lib/tenantI18n/importPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type ManualResult = {
  ok: boolean;
  message: string;
  personaId?: string;
};

type PersonaImportFormsProps = {
  messages: TenantMessages;
};

export function PersonaImportForms({ messages }: PersonaImportFormsProps) {
  const router = useRouter();
  const copy = messages.personas.import;
  const meta = messages.personas.metadata;

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
          ? payload.queueError || copy.queueRetryWarning
          : null;

      setManualResult({
        ok: Boolean(payload.ok),
        message:
          warning ||
          payload.message ||
          errorMessage ||
          copy.createFinished,
        personaId: payload.personaId,
      });

      if (payload.ok && payload.personaId) {
        router.push(`/personas/${payload.personaId}`);
      }
    } catch (error) {
      setManualResult({
        ok: false,
        message: error instanceof Error ? error.message : copy.createFailed,
      });
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <PersonaCreationBlock
          title={copy.manualTitle}
          panelId="persona-creation-manual"
          summary={copy.manualSummary}
        >
          <form onSubmit={submitManual} className="space-y-4">
            <label className="block text-sm text-white/50">
              {meta.personaName}
              <span className="mt-1 block text-xs leading-5 text-white/35">
                {copy.helpPersonaName}
              </span>
              <input
                value={manual.persona_name ?? ""}
                onChange={(event) => setField("persona_name", event.target.value)}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              {meta.shortDescription}
              <span className="mt-1 block text-xs leading-5 text-white/35">
                {copy.helpShortDescription}
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
              {meta.additionalContext}
              <span className="mt-1 block text-xs leading-5 text-white/35">
                {copy.helpAdditionalContext}
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
              {meta.referenceWebsite}
              <span className="mt-1 block text-xs leading-5 text-white/35">
                {copy.helpReferenceWebsite}
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
              {meta.notes}
              <span className="mt-1 block text-xs leading-5 text-white/35">
                {copy.helpNotes}
              </span>
              <textarea
                value={manual.notes ?? ""}
                onChange={(event) => setField("notes", event.target.value)}
                rows={3}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              {meta.adsContent}
              <span className="mt-1 block text-xs leading-5 text-white/35">
                {copy.helpAdsContent}
              </span>
              <textarea
                value={manual.ads_content ?? ""}
                onChange={(event) => setField("ads_content", event.target.value)}
                rows={4}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block text-sm text-white/50">
              {meta.category}
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
                  title={getLocalizedPersonaImportGroupTitle(
                    messages,
                    group.title,
                  )}
                  defaultOpen={false}
                >
                  <div className="grid gap-4">
                    {group.fields.map(([key]) => (
                      <label key={key} className="block text-sm text-white/50">
                        {getLocalizedPersonaImportFieldLabel(messages, key)}
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
              {manualSubmitting ? copy.creating : copy.createCta}
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
                    {copy.openPersona}
                  </Link>
                </div>
              )}
            </div>
          )}
        </PersonaCreationBlock>

        <PersonaGenerateForm messages={messages} />
      </div>

      <PersonaCsvImport messages={messages} />
    </div>
  );
}
