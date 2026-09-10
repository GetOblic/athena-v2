"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles } from "lucide-react";
import { CopyButton } from "@/components/deployment/CopyButton";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  PROSPECT_DETAIL_ANCHORS,
  PROSPECT_DETAIL_ICON,
  PROSPECT_GETOBLIC_DESCRIPTION_SURFACE,
  PROSPECT_PRIMARY_ACTION,
  PROSPECT_STATUS_CHIP_READY,
  PROSPECT_STATUS_CHIP_SAVED,
  PROSPECT_UTILITY_CYAN_ACTION,
} from "@/lib/prospects/prospectDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { ProspectGeneratedListingDescription } from "@/services/prospects/prospectGeneratedListingDescription";

export type ProspectGetoblicDescriptionMessages = {
  title: string;
  help: string;
  empty: string;
  generate: string;
  generating: string;
  refresh: string;
  ready: string;
  notGenerated: string;
  copy: string;
  copied: string;
  failed: string;
  currentListingCopy: string;
  generatedDescription: string;
};

type ProspectGetoblicDescriptionCardProps = {
  prospectId: string;
  currentListingCopy?: string | null;
  generatedListingDescription?: ProspectGeneratedListingDescription | null;
  messages: ProspectGetoblicDescriptionMessages;
  defaultOpen?: boolean;
};

export function ProspectGetoblicDescriptionCard({
  prospectId,
  currentListingCopy = null,
  generatedListingDescription = null,
  messages,
  defaultOpen = false,
}: ProspectGetoblicDescriptionCardProps) {
  const refreshPage = useSafeRouterRefresh();
  const [generated, setGenerated] = useState<ProspectGeneratedListingDescription | null>(
    generatedListingDescription,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasGenerated = Boolean(generated?.description?.trim());
  const importedCopy = currentListingCopy?.trim() || "";

  async function runGeneration() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/prospects/${prospectId}/getoblic-description`,
        { method: "POST" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        generatedListingDescription?: ProspectGeneratedListingDescription;
        error?: { message?: string };
      }>(response);

      if (!response.ok || !payload.ok || !payload.generatedListingDescription?.description) {
        const apiMessage =
          typeof payload.error?.message === "string"
            ? payload.error.message.trim()
            : "";
        setError(apiMessage || messages.failed);
        return;
      }

      setGenerated(payload.generatedListingDescription);
      refreshPage();
    } catch {
      setError(messages.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <AthenaCollapsibleSection
      id={PROSPECT_DETAIL_ANCHORS.getoblicDescription}
      title={messages.title}
      summary={messages.help}
      defaultOpen={defaultOpen}
      tone="intelligence"
      icon={<FileText />}
      iconClassName={PROSPECT_DETAIL_ICON.cyan}
      className={PROSPECT_GETOBLIC_DESCRIPTION_SURFACE}
      headerAside={
        <span className={hasGenerated ? PROSPECT_STATUS_CHIP_READY : PROSPECT_STATUS_CHIP_SAVED}>
          {hasGenerated ? messages.ready : messages.notGenerated}
        </span>
      }
    >
      <div data-prospect-detail="getoblic-description" className="space-y-5">
        {importedCopy ? (
          <div className="rounded-2xl border border-[rgba(56,189,248,0.16)] bg-[rgba(56,189,248,0.05)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/55">
              {messages.currentListingCopy}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/55">
              {importedCopy}
            </p>
          </div>
        ) : null}

        {hasGenerated ? (
          <div className="rounded-2xl border border-[rgba(0,208,132,0.22)] bg-[rgba(0,208,132,0.06)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--athena-success)]/70">
                {messages.generatedDescription}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                  text={generated!.description}
                  tracking={null}
                  showContinue={false}
                  variant="utility"
                  chrome={{
                    copy: messages.copy,
                    copied: messages.copied,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void runGeneration()}
                  disabled={pending}
                  className={`${PROSPECT_UTILITY_CYAN_ACTION} h-9 px-4 text-xs`}
                >
                  {pending ? messages.generating : messages.refresh}
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-white/85">
              {generated!.description}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm leading-6 text-white/55">{messages.empty}</p>
            <button
              type="button"
              onClick={() => void runGeneration()}
              disabled={pending}
              className={`${PROSPECT_PRIMARY_ACTION} mt-4`}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {pending ? messages.generating : messages.generate}
            </button>
          </div>
        )}

        {error ? (
          <p className="text-sm leading-6 text-rose-200/85" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </AthenaCollapsibleSection>
  );
}

function useSafeRouterRefresh(): () => void {
  try {
    const router = useRouter();
    return () => {
      router.refresh();
    };
  } catch {
    return () => {};
  }
}
