"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertTriangle, PenLine, SlidersHorizontal } from "lucide-react";
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
  PERSONA_IMPORT_ADVANCED_ICON,
  PERSONA_IMPORT_ADVANCED_SURFACE,
  PERSONA_IMPORT_ERROR_CLASS,
  PERSONA_IMPORT_FIELD_HELP_CLASS,
  PERSONA_IMPORT_FIELD_LABEL_CLASS,
  PERSONA_IMPORT_PRIMARY_CLASS,
  PERSONA_IMPORT_SUCCESS_CLASS,
} from "@/lib/personas/personaImportPresentation";
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

function ManualAdvancedFieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`min-w-0 ${open ? "lg:col-span-2" : ""}`}>
      <AthenaCollapsibleSection
        title={title}
        defaultOpen={false}
        open={open}
        onOpenChange={setOpen}
        tone="intelligence"
        icon={<SlidersHorizontal aria-hidden="true" />}
        iconClassName={PERSONA_IMPORT_ADVANCED_ICON}
        className={PERSONA_IMPORT_ADVANCED_SURFACE}
      >
        {children}
      </AthenaCollapsibleSection>
    </div>
  );
}

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
      <div className="mx-auto w-full min-w-0 max-w-3xl">
        <PersonaGenerateForm messages={messages} />
      </div>

      <PersonaCreationBlock
        title={copy.manualTitle}
        panelId="persona-creation-manual"
        summary={copy.manualSummary}
        className="mx-auto w-full min-w-0 max-w-3xl"
        expandedClassName="lg:max-w-6xl"
        accent="violet"
        icon={<PenLine className="size-5" />}
      >
          <form onSubmit={submitManual} className="space-y-4">
            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.personaName}
              </span>
              <span className={PERSONA_IMPORT_FIELD_HELP_CLASS}>
                {copy.helpPersonaName}
              </span>
              <input
                value={manual.persona_name ?? ""}
                onChange={(event) => setField("persona_name", event.target.value)}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.shortDescription}
              </span>
              <span className={PERSONA_IMPORT_FIELD_HELP_CLASS}>
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

            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.additionalContext}
              </span>
              <span className={PERSONA_IMPORT_FIELD_HELP_CLASS}>
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

            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.referenceWebsite}
              </span>
              <span className={PERSONA_IMPORT_FIELD_HELP_CLASS}>
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

            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.notes}
              </span>
              <span className={PERSONA_IMPORT_FIELD_HELP_CLASS}>
                {copy.helpNotes}
              </span>
              <textarea
                value={manual.notes ?? ""}
                onChange={(event) => setField("notes", event.target.value)}
                rows={3}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.adsContent}
              </span>
              <span className={PERSONA_IMPORT_FIELD_HELP_CLASS}>
                {copy.helpAdsContent}
              </span>
              <textarea
                value={manual.ads_content ?? ""}
                onChange={(event) => setField("ads_content", event.target.value)}
                rows={4}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <label className="block space-y-2">
              <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                {meta.category}
              </span>
              <input
                value={manual.category ?? ""}
                onChange={(event) => setField("category", event.target.value)}
                className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
              />
            </label>

            <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-2">
              {PERSONA_ADVANCED_FIELD_GROUPS.map((group) => (
                <ManualAdvancedFieldGroup
                  key={group.title}
                  title={getLocalizedPersonaImportGroupTitle(
                    messages,
                    group.title,
                  )}
                >
                  <div className="grid gap-4">
                    {group.fields.map(([key]) => (
                      <label key={key} className="block space-y-2">
                        <span className={PERSONA_IMPORT_FIELD_LABEL_CLASS}>
                          {getLocalizedPersonaImportFieldLabel(messages, key)}
                        </span>
                        <input
                          value={manual[key] ?? ""}
                          onChange={(event) => setField(key, event.target.value)}
                          className={`mt-2 w-full ${PERSONA_FORM_FIELD_CLASS}`}
                        />
                      </label>
                    ))}
                  </div>
                </ManualAdvancedFieldGroup>
              ))}
            </div>

            <button
              type="submit"
              disabled={manualSubmitting}
              className={PERSONA_IMPORT_PRIMARY_CLASS}
            >
              {manualSubmitting ? copy.creating : copy.createCta}
            </button>
          </form>

          {manualResult && (
            <div
              className={`mt-6 ${
                manualResult.ok
                  ? PERSONA_IMPORT_SUCCESS_CLASS
                  : PERSONA_IMPORT_ERROR_CLASS
              }`}
            >
              {!manualResult.ok ? (
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
              ) : null}
              <div>
                {manualResult.message}
                {manualResult.personaId && (
                  <div className="mt-3">
                    <Link
                      href={`/personas/${manualResult.personaId}`}
                      className={PERSONA_IMPORT_PRIMARY_CLASS}
                    >
                      {copy.openPersona}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
      </PersonaCreationBlock>

      <div className="mx-auto w-full min-w-0 max-w-3xl">
        <PersonaCsvImport messages={messages} />
      </div>
    </div>
  );
}
