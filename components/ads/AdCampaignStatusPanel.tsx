"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { AdCampaignGenerationStage } from "@/services/ads/adCampaignTypes";

const STAGE_LABELS: Record<AdCampaignGenerationStage, string> = {
  assembling_context: "Assembling organization context",
  strategy: "Generating campaign strategy",
  facebook: "Generating Facebook assets",
  instagram: "Generating Instagram assets",
  tiktok: "Generating TikTok assets",
  google_search: "Generating Google Search Ads",
  keyword_themes: "Generating keyword themes",
  validating: "Validating campaign package",
  completed: "Completed",
  failed: "Failed",
};

type StatusPayload = {
  ok?: boolean;
  status?: string;
  generationStage?: AdCampaignGenerationStage | null;
  errorMessage?: string | null;
  isReady?: boolean;
  isFailed?: boolean;
  isInFlight?: boolean;
};

type AdCampaignStatusPanelProps = {
  campaignId: string;
  initialStatus: string;
  initialStage: AdCampaignGenerationStage | null;
  initialErrorMessage?: string | null;
};

export function AdCampaignStatusPanel({
  campaignId,
  initialStatus,
  initialStage,
  initialErrorMessage = null,
}: AdCampaignStatusPanelProps) {
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
        const response = await fetch(`/api/ads/${campaignId}/status`, {
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
  }, [campaignId, inFlight, router]);

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/ads/${campaignId}/regenerate`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        campaign?: { id?: string };
        error?: { message?: string };
      }>(response);
      if (!payload.ok || !payload.campaign?.id) {
        setActionError(
          payload.error?.message || "Failed to regenerate ad campaign.",
        );
        return;
      }
      router.push(`/ads/${payload.campaign.id}`);
      router.refresh();
    } catch {
      setActionError("Failed to regenerate ad campaign.");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRetryGenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/ads/${campaignId}/generate`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        error?: { message?: string; code?: string };
      }>(response);
      if (!payload.ok) {
        // Ready immutable → regenerate path
        if (payload.error?.code === "READY_IMMUTABLE") {
          await handleRegenerate();
          return;
        }
        setActionError(
          payload.error?.message || "Failed to retry Ads generation.",
        );
        return;
      }
      setStatus("Processing");
      router.refresh();
    } catch {
      setActionError("Failed to retry Ads generation.");
    } finally {
      setRegenerating(false);
    }
  }

  if (status === "Ready") {
    return null;
  }

  const stageLabel =
    stage && STAGE_LABELS[stage] ? STAGE_LABELS[stage] : "Queued";

  return (
    <div className="mb-8 rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
        Generation status
      </div>
      <h2 className="mt-3 text-2xl font-semibold">{status}</h2>
      {inFlight ? (
        <p className="mt-3 text-sm leading-7 text-white/60">
          {stageLabel}. You can leave this page and return later.
        </p>
      ) : null}
      {status === "Processing Failed" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-7 text-rose-100/80">
            {errorMessage || "Ads generation failed."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleRetryGenerate()}
              disabled={regenerating}
              className="rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {regenerating ? "Working…" : "Retry generation"}
            </button>
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 disabled:opacity-60"
            >
              Regenerate as new campaign
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
