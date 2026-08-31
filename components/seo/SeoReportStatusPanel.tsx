"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  getLocalizedSeoGenerationStageLabel,
  getLocalizedSeoReportStatusLabel,
} from "@/lib/tenantI18n/seoPresentation";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SeoReportGenerationStage } from "@/services/seo/seoReportTypes";

const STAGE_LABELS: Record<SeoReportGenerationStage, string> = {
  assembling_context: "Assembling organization intelligence",
  executive_assessment: "Generating executive SEO assessment",
  content_coverage: "Analyzing content coverage",
  customer_intent: "Analyzing customer intent",
  commercial_opportunities: "Identifying commercial opportunities",
  trust_and_authority: "Evaluating trust and authority",
  ninety_day_roadmap: "Building 90-day SEO roadmap",
  analyzing_technical_evidence: "Analyzing technical SEO evidence",
  technical_executive_evaluation: "Generating technical executive evaluation",
  technical_recommendations: "Building technical recommendations",
  technical_action_plan: "Building technical action plan",
  validating: "Validating SEO report",
  completed: "Completed",
  failed: "Failed",
};

type StatusPayload = {
  ok?: boolean;
  status?: string;
  generationStage?: SeoReportGenerationStage | null;
  errorMessage?: string | null;
  isReady?: boolean;
  isFailed?: boolean;
  isInFlight?: boolean;
};

type SeoReportStatusPanelProps = {
  reportId: string;
  initialStatus: string;
  initialStage: SeoReportGenerationStage | null;
  initialErrorMessage?: string | null;
  messages?: TenantMessages;
};

export function SeoReportStatusPanel({
  reportId,
  initialStatus,
  initialStage,
  initialErrorMessage = null,
  messages,
}: SeoReportStatusPanelProps) {
  const copy = messages?.seo.statusPanel ?? en.seo.statusPanel;
  const dictionary = messages ?? en;
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [stage, setStage] = useState(initialStage);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const inFlight = status === "Queued" || status === "Processing";

  useEffect(() => {
    if (!inFlight) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/seo/${reportId}/status`, {
          cache: "no-store",
        });
        const payload = await parseJsonResponse<StatusPayload>(response);
        if (cancelled || !payload.ok) return;

        if (payload.status) setStatus(payload.status);
        if (payload.generationStage !== undefined) {
          setStage(payload.generationStage ?? null);
        }
        if (payload.errorMessage !== undefined) {
          setErrorMessage(payload.errorMessage ?? null);
        }

        if (payload.isReady || payload.status === "Ready") {
          router.refresh();
        }
      } catch {
        // Keep polling; transient failures are expected.
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reportId, inFlight, router]);

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/seo/${reportId}/regenerate`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        report?: { id?: string };
        error?: { message?: string };
      }>(response);
      if (!payload.ok || !payload.report?.id) {
        setActionError(payload.error?.message || copy.regenerateFailed);
        return;
      }
      router.push(`/seo/${payload.report.id}`);
      router.refresh();
    } catch {
      setActionError(copy.regenerateFailed);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRetryGenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/seo/${reportId}/generate`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: { message?: string; code?: string };
      }>(response);
      if (!payload.ok) {
        if (payload.error?.code === "READY_IMMUTABLE") {
          await handleRegenerate();
          return;
        }
        setActionError(payload.error?.message || copy.retryFailed);
        return;
      }
      setStatus("Processing");
      router.refresh();
    } catch {
      setActionError(copy.retryFailed);
    } finally {
      setRegenerating(false);
    }
  }

  if (status === "Ready") {
    return null;
  }

  const stageLabel = messages
    ? getLocalizedSeoGenerationStageLabel(dictionary, stage)
    : stage && STAGE_LABELS[stage]
      ? STAGE_LABELS[stage]
      : "Queued";

  const leaveAndReturn = interpolateTenantMessage(
    copy.leaveAndReturn.includes("{stage}")
      ? copy.leaveAndReturn
      : en.seo.statusPanel.leaveAndReturn,
    { stage: stageLabel },
  );

  return (
    <div className="mb-8 rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
        {copy.generationStatus}
      </div>
      <h2 className="mt-3 text-2xl font-semibold">
        {getLocalizedSeoReportStatusLabel(dictionary, status)}
      </h2>
      {inFlight ? (
        <p className="mt-3 text-sm leading-7 text-white/60">{leaveAndReturn}</p>
      ) : null}
      {status === "Processing Failed" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-7 text-rose-100/80">
            {errorMessage || copy.generationFailed}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleRetryGenerate()}
              disabled={regenerating}
              className="rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {regenerating ? copy.working : copy.retry}
            </button>
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 disabled:opacity-60"
            >
              {copy.regenerateAsNew}
            </button>
          </div>
        </div>
      ) : null}
      {actionError ? (
        <p className="mt-3 text-sm text-rose-200">{actionError}</p>
      ) : null}
    </div>
  );
}
