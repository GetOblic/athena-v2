"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  ESTIMATE_POLL_INTERVAL_MS,
  ESTIMATE_PROJECT_NEED_MIN_LENGTH,
  ESTIMATE_REQUEST_FIELD_LIMITS,
  ESTIMATE_TIMEFRAME_OPTIONS,
  estimateStageLabel,
  formatEstimateDate,
  formatEstimateMoney,
  truncateProjectNeed,
} from "@/components/licensee/estimate/estimateUiHelpers";
import type {
  PublicAthenaEstimateDetail,
  PublicAthenaEstimateSummary,
} from "@/services/estimate/athenaEstimatePublic";
import type { AthenaEstimateTimeframe } from "@/services/estimate/athenaEstimateTypes";
import {
  resolveLicenseeSubAccountTitle,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";

type LicenseeEstimateClientProps = {
  subAccounts: LicenseeSubAccountListItem[];
};

type ApiErrorBody = {
  ok?: boolean;
  error?: { code?: string; message?: string };
};

type CreateResponse = ApiErrorBody & {
  ok?: boolean;
  estimate?: PublicAthenaEstimateDetail;
  jobId?: string;
};

type ListResponse = ApiErrorBody & {
  ok?: boolean;
  estimates?: PublicAthenaEstimateSummary[];
};

type DetailResponse = ApiErrorBody & {
  ok?: boolean;
  estimate?: PublicAthenaEstimateDetail;
};

type RegenerateResponse = CreateResponse & {
  regeneratedFrom?: string;
};

const HOW_IT_WORKS = [
  {
    title: "Client Intelligence",
    copy: "Athena uses what it already knows about the selected client — business context, technical condition, and strategic signals already in Athena.",
  },
  {
    title: "Project Intelligence",
    copy: "You describe what the client needs, the expected work, and timing. This is operator guidance for the project — not a replacement for Athena’s trusted client evidence.",
  },
  {
    title: "Pricing Intelligence",
    copy: "Athena evaluates scope, complexity, business context, geography, timeframe, commercial value, and general market pricing knowledge to help you decide what to charge.",
  },
] as const;

function isInFlightStatus(status: string | undefined | null): boolean {
  return status === "Queued" || status === "Processing";
}

export function LicenseeEstimateClient({
  subAccounts,
}: LicenseeEstimateClientProps) {
  const [organizationId, setOrganizationId] = useState(
    subAccounts[0]?.organizationId ?? "",
  );
  const [projectNeed, setProjectNeed] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [timeframe, setTimeframe] = useState<"" | AthenaEstimateTimeframe>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [activeEstimate, setActiveEstimate] =
    useState<PublicAthenaEstimateDetail | null>(null);
  const [history, setHistory] = useState<PublicAthenaEstimateSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const pollTimerRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/licensee/estimate", {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<ListResponse>(response);
      if (!payload.ok || !Array.isArray(payload.estimates)) {
        setHistoryError(
          payload.error?.message || "Could not load Estimate history.",
        );
        return;
      }
      const sorted = [...payload.estimates].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setHistory(sorted);
      setHistoryError(null);
    } catch {
      setHistoryError("Could not load Estimate history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const pollDetail = useCallback(
    async (estimateId: string) => {
      try {
        const response = await fetch(`/api/licensee/estimate/${estimateId}`, {
          cache: "no-store",
        });
        const payload = await parseJsonResponse<DetailResponse>(response);
        if (!payload.ok || !payload.estimate) return;
        if (activeIdRef.current !== estimateId) return;

        setActiveEstimate(payload.estimate);

        if (
          payload.estimate.status === "Ready" ||
          payload.estimate.status === "Processing Failed"
        ) {
          stopPolling();
          void refreshHistory();
        }
      } catch {
        // Transient failures are expected while polling.
      }
    },
    [refreshHistory, stopPolling],
  );

  const startPolling = useCallback(
    (estimateId: string) => {
      stopPolling();
      activeIdRef.current = estimateId;
      void pollDetail(estimateId);
      pollTimerRef.current = window.setInterval(() => {
        void pollDetail(estimateId);
      }, ESTIMATE_POLL_INTERVAL_MS);
    },
    [pollDetail, stopPolling],
  );

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const response = await fetch("/api/licensee/estimate", {
          cache: "no-store",
        });
        const payload = await parseJsonResponse<ListResponse>(response);
        if (cancelled) return;
        if (!payload.ok || !Array.isArray(payload.estimates)) {
          setHistoryError(
            payload.error?.message || "Could not load Estimate history.",
          );
          setHistoryLoading(false);
          return;
        }
        const sorted = [...payload.estimates].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setHistory(sorted);
        setHistoryError(null);
      } catch {
        if (!cancelled) {
          setHistoryError("Could not load Estimate history.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (!activeEstimate || !isInFlightStatus(activeEstimate.status)) {
      stopPolling();
      return;
    }
    if (activeIdRef.current === activeEstimate.id && pollTimerRef.current) {
      return;
    }
    startPolling(activeEstimate.id);
  }, [activeEstimate, startPolling, stopPolling]);

  function resetFormFields() {
    setProjectNeed("");
    setAdditionalContext("");
    setTimeframe("");
    setFormError(null);
    setSubmitError(null);
  }

  function handleCreateAnother() {
    stopPolling();
    activeIdRef.current = null;
    setActiveEstimate(null);
    resetFormFields();
    const form = document.getElementById("athena-estimate-form");
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function validateForm(): boolean {
    if (!organizationId.trim()) {
      setFormError("Select a client / Athena sub-account.");
      return false;
    }
    const need = projectNeed.trim();
    if (need.length < ESTIMATE_PROJECT_NEED_MIN_LENGTH) {
      setFormError("Describe what the client needs.");
      return false;
    }
    if (need.length > ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed) {
      setFormError(
        `Project description must be at most ${ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed} characters.`,
      );
      return false;
    }
    if (
      additionalContext.trim().length >
      ESTIMATE_REQUEST_FIELD_LIMITS.additionalContext
    ) {
      setFormError(
        `Additional context must be at most ${ESTIMATE_REQUEST_FIELD_LIMITS.additionalContext} characters.`,
      );
      return false;
    }
    setFormError(null);
    return true;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validateForm()) return;

    setSubmitting(true);
    setSubmitError(null);

    const body: {
      organizationId: string;
      projectNeed: string;
      additionalContext?: string;
      timeframe?: AthenaEstimateTimeframe;
    } = {
      organizationId,
      projectNeed: projectNeed.trim(),
    };
    const context = additionalContext.trim();
    if (context) body.additionalContext = context;
    if (timeframe) body.timeframe = timeframe;

    try {
      const response = await fetch("/api/licensee/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await parseJsonResponse<CreateResponse>(response);
      if (!response.ok || !payload.ok || !payload.estimate?.id) {
        setSubmitError(
          payload.error?.message || "Could not create Estimate.",
        );
        return;
      }

      setActiveEstimate(payload.estimate);
      startPolling(payload.estimate.id);
      void refreshHistory();
      document
        .getElementById("athena-estimate-result")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setSubmitError("Could not create Estimate.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openHistoryItem(id: string) {
    setSubmitError(null);
    try {
      const response = await fetch(`/api/licensee/estimate/${id}`, {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<DetailResponse>(response);
      if (!payload.ok || !payload.estimate) {
        setSubmitError(
          payload.error?.message || "Could not open Estimate.",
        );
        return;
      }
      setActiveEstimate(payload.estimate);
      if (isInFlightStatus(payload.estimate.status)) {
        startPolling(payload.estimate.id);
      } else {
        stopPolling();
        activeIdRef.current = payload.estimate.id;
      }
      document
        .getElementById("athena-estimate-result")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setSubmitError("Could not open Estimate.");
    }
  }

  async function handleRegenerate() {
    if (!activeEstimate || regenerating) return;
    if (!activeEstimate.relationshipConnected) return;

    setRegenerating(true);
    setSubmitError(null);
    try {
      const response = await fetch(
        `/api/licensee/estimate/${activeEstimate.id}/regenerate`,
        { method: "POST" },
      );
      const payload = await parseJsonResponse<RegenerateResponse>(response);
      if (!response.ok || !payload.ok || !payload.estimate?.id) {
        setSubmitError(
          payload.error?.message || "Could not regenerate Estimate.",
        );
        return;
      }
      setActiveEstimate(payload.estimate);
      startPolling(payload.estimate.id);
      void refreshHistory();
    } catch {
      setSubmitError("Could not regenerate Estimate.");
    } finally {
      setRegenerating(false);
    }
  }

  const pkg = activeEstimate?.package ?? null;
  const inFlight = isInFlightStatus(activeEstimate?.status);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="max-w-4xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Estimate
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Know What to Charge.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-white/55 md:text-lg">
          Athena already knows your client. Describe the project, and Athena
          evaluates the business, scope, context, and pricing factors to help
          you determine what to charge.
        </p>
        <a
          href="#athena-estimate-form"
          className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
        >
          Create an Estimate
        </a>
        <p className="mt-4 text-xs tracking-wide text-white/40">
          AI-assisted commercial guidance based on your client’s Athena
          intelligence.
        </p>
      </section>

      {/* How it works */}
      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          How Athena Estimate Works
        </div>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          Client knowledge. Project clarity. Pricing intelligence.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-white/10 bg-black/25 p-5"
            >
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/55">{item.copy}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm leading-6 text-white/40">
          General market pricing knowledge is AI-assisted model prior — not live
          market research, competitor quotation data, or a binding quote.
        </p>
      </section>

      {/* Form */}
      <section
        id="athena-estimate-form"
        className="scroll-mt-8 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Create Estimate
        </div>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          Tell Athena what your client needs
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
          Select a linked Athena sub-account. Athena already holds the client
          profile — you only describe the project.
        </p>

        {subAccounts.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
            Create a linked Athena sub-account from your Master dashboard before
            generating an Estimate.{" "}
            <Link
              href="/licensee/sub-accounts/new"
              className="font-medium text-[var(--athena-orange)] underline-offset-2 hover:underline"
            >
              Create Sub-account
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="estimate-organization"
                className="block text-sm font-medium text-white/80"
              >
                Client / Athena sub-account
              </label>
              <select
                id="estimate-organization"
                name="organizationId"
                required
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
              >
                {subAccounts.map((item) => (
                  <option key={item.organizationId} value={item.organizationId}>
                    {resolveLicenseeSubAccountTitle(item)}
                    {item.accountEmail ? ` · ${item.accountEmail}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="estimate-project-need"
                className="block text-sm font-medium text-white/80"
              >
                What does the client need?
              </label>
              <textarea
                id="estimate-project-need"
                name="projectNeed"
                required
                rows={5}
                maxLength={ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed}
                value={projectNeed}
                onChange={(event) => setProjectNeed(event.target.value)}
                placeholder="Describe the project scope, deliverables, and what success looks like."
                className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
              />
              <p className="mt-1 text-xs text-white/35">
                {projectNeed.trim().length}/
                {ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed}
              </p>
            </div>

            <div>
              <label
                htmlFor="estimate-additional-context"
                className="block text-sm font-medium text-white/80"
              >
                Additional context{" "}
                <span className="font-normal text-white/40">(optional)</span>
              </label>
              <textarea
                id="estimate-additional-context"
                name="additionalContext"
                rows={3}
                maxLength={ESTIMATE_REQUEST_FIELD_LIMITS.additionalContext}
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                placeholder="Constraints, stakeholders, budget signals, or other commercial notes."
                className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
              />
            </div>

            <div>
              <label
                htmlFor="estimate-timeframe"
                className="block text-sm font-medium text-white/80"
              >
                Desired timeframe{" "}
                <span className="font-normal text-white/40">(optional)</span>
              </label>
              <select
                id="estimate-timeframe"
                name="timeframe"
                value={timeframe}
                onChange={(event) =>
                  setTimeframe(
                    event.target.value as "" | AthenaEstimateTimeframe,
                  )
                }
                className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30 md:max-w-sm"
              >
                <option value="">Not specified</option>
                {ESTIMATE_TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {formError ? (
              <p className="text-sm text-red-300" role="alert">
                {formError}
              </p>
            ) : null}
            {submitError ? (
              <p className="text-sm text-red-300" role="alert">
                {submitError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || subAccounts.length === 0}
              className="inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating Estimate…" : "Generate Estimate"}
            </button>
          </form>
        )}
      </section>

      {/* Result / status */}
      <section
        id="athena-estimate-result"
        className="scroll-mt-8 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              Estimate Result
            </div>
            <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
              {activeEstimate
                ? activeEstimate.organizationNameSnapshot
                : "Your Estimate will appear here"}
            </h2>
          </div>
          {activeEstimate ? (
            <button
              type="button"
              onClick={handleCreateAnother}
              className="text-sm font-medium text-[var(--athena-orange)] hover:underline"
            >
              Create Another Estimate
            </button>
          ) : null}
        </div>

        {!activeEstimate ? (
          <p className="mt-6 text-sm leading-6 text-white/45">
            Submit a project above or open an Estimate from your history.
          </p>
        ) : null}

        {activeEstimate && inFlight ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 px-5 py-6">
            <div className="text-sm font-semibold text-white">
              {activeEstimate.status === "Queued"
                ? "Estimate queued"
                : "Generating Estimate"}
            </div>
            <p className="mt-2 text-sm text-white/55">
              {estimateStageLabel(activeEstimate.generationStage) ||
                (activeEstimate.status === "Queued"
                  ? "Waiting for an available Athena worker."
                  : "Athena is preparing your pricing recommendation.")}
            </p>
            <p className="mt-4 text-xs text-white/35">
              This usually takes a short while. You can leave this page open —
              history will update when Ready.
            </p>
          </div>
        ) : null}

        {activeEstimate?.status === "Processing Failed" ? (
          <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-6">
            <div className="text-sm font-semibold text-red-100">
              Estimate could not be completed
            </div>
            <p className="mt-2 text-sm text-red-100/80">
              {activeEstimate.errorMessage?.trim() ||
                "Something went wrong while generating this Estimate. Try again when ready."}
            </p>
            {activeEstimate.relationshipConnected ? (
              <button
                type="button"
                disabled={regenerating}
                onClick={() => void handleRegenerate()}
                className="mt-5 inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
              >
                {regenerating ? "Starting…" : "Try Again (New Estimate)"}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeEstimate?.status === "Ready" && pkg ? (
          <div className="mt-8 space-y-6">
            {!activeEstimate.relationshipConnected ? (
              <div className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                No longer connected
              </div>
            ) : null}

            <div className="rounded-2xl border border-[var(--athena-orange)]/30 bg-gradient-to-br from-black/40 to-[#1a1410] px-6 py-8">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--athena-orange)]">
                Recommended Client Price
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {formatEstimateMoney(
                  pkg.recommendedClientPrice.amount,
                  pkg.recommendedClientPrice.currencyCode,
                )}
              </div>
              <div className="mt-4 text-sm text-white/55">
                Recommended range:{" "}
                <span className="font-medium text-white/85">
                  {formatEstimateMoney(
                    pkg.recommendedPriceRange.low.amount,
                    pkg.recommendedPriceRange.low.currencyCode,
                  )}{" "}
                  →{" "}
                  {formatEstimateMoney(
                    pkg.recommendedPriceRange.high.amount,
                    pkg.recommendedPriceRange.high.currencyCode,
                  )}
                </span>
              </div>
              {pkg.geographyLabel ? (
                <p className="mt-3 text-sm text-white/45">
                  Geography: {pkg.geographyLabel}
                </p>
              ) : null}
              {pkg.currencyResolution === "fallback" ? (
                <p className="mt-2 text-sm text-amber-100/80">
                  Geography/currency could not be reliably established from
                  trusted Athena evidence — amounts are shown in USD as fallback
                  guidance.
                </p>
              ) : null}
            </div>

            <ResultSection title="Scope Interpretation">
              {pkg.scopeInterpretation}
            </ResultSection>
            <ResultSection title="Pricing Rationale">
              {pkg.pricingRationale}
            </ResultSection>
            <ResultSection title="Key Price Drivers">
              <ul className="list-disc space-y-2 pl-5">
                {pkg.keyPriceDrivers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ResultSection>
            <ResultSection title="Suggested Client Positioning">
              {pkg.suggestedClientPositioning}
            </ResultSection>
            <ResultSection title="Risks & Assumptions">
              <ul className="list-disc space-y-2 pl-5">
                {pkg.risksAndAssumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ResultSection>

            <p className="text-xs leading-5 text-white/35">
              {pkg.guidanceDisclaimer}
            </p>

            <div className="flex flex-wrap gap-3">
              {activeEstimate.relationshipConnected ? (
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={() => void handleRegenerate()}
                  className="inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
                >
                  {regenerating ? "Starting…" : "Regenerate as New Estimate"}
                </button>
              ) : (
                <p className="text-sm text-white/40">
                  Regeneration unavailable — this client is no longer connected
                  to your Master account.
                </p>
              )}
              <button
                type="button"
                onClick={handleCreateAnother}
                className="inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Create Another Estimate
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* History */}
      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Estimate History
        </div>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          Your previous Estimates
        </h2>
        <p className="mt-3 text-sm text-white/45">
          Historical Estimates stay readable. Opening one never regenerates it.
        </p>

        {historyLoading ? (
          <p className="mt-6 text-sm text-white/40">Loading history…</p>
        ) : null}
        {historyError ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {historyError}
          </p>
        ) : null}
        {!historyLoading && !historyError && history.length === 0 ? (
          <p className="mt-6 text-sm text-white/40">
            No Estimates yet. Create your first one above.
          </p>
        ) : null}

        <ul className="mt-6 space-y-3">
          {history.map((item) => {
            const selected = activeEstimate?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openHistoryItem(item.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selected
                      ? "border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">
                          {item.organizationNameSnapshot}
                        </span>
                        <StatusBadge status={item.status} />
                        {!item.relationshipConnected ? (
                          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-100">
                            No longer connected
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-white/50">
                        {truncateProjectNeed(item.request.projectNeed)}
                      </p>
                      <p className="mt-1 text-xs text-white/35">
                        {formatEstimateDate(item.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-sm font-medium text-white/80">
                      {item.status === "Ready" && item.recommendedClientPrice
                        ? formatEstimateMoney(
                            item.recommendedClientPrice.amount,
                            item.recommendedClientPrice.currencyCode,
                          )
                        : "—"}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Quote cross-link */}
      <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-6 text-center md:p-10">
        <h2 className="text-2xl font-semibold md:text-3xl">
          Want GetOblic to fulfill this project?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55">
          Athena Estimate helps you decide what to charge. When you want GetOblic
          fulfillment pricing for delivery, request a private Quote.
        </p>
        <Link
          href="/licensee/quote"
          className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
        >
          Request a Fulfillment Quote
        </Link>
        <p className="mt-4 text-xs text-white/35">
          Opens Athena Quote only — Estimate data is not transferred.
        </p>
      </section>
    </div>
  );
}

function ResultSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--athena-orange)]">
        {title}
      </h3>
      <div className="mt-3 text-sm leading-7 text-white/70">{children}</div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "Ready"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : status === "Processing Failed"
        ? "border-red-400/30 bg-red-500/10 text-red-100"
        : "border-white/15 bg-white/5 text-white/70";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {status}
    </span>
  );
}
