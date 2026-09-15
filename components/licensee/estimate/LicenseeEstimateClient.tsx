"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { EstimateAskAthenaPanel } from "@/components/licensee/estimate/EstimateAskAthenaPanel";
import { EstimateProspectSelect } from "@/components/licensee/estimate/EstimateProspectSelect";
import {
  ESTIMATE_POLL_INTERVAL_MS,
  ESTIMATE_PROJECT_NEED_MIN_LENGTH,
  ESTIMATE_PROSPECT_REMOVED_LABEL,
  ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE,
  ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE,
  ESTIMATE_REQUEST_FIELD_LIMITS,
  estimateHasProspectTarget,
  estimateStageLabel,
  formatEstimateDate,
  formatEstimateHistoryPrimaryLabel,
  formatEstimateMoney,
  truncateProjectNeed,
} from "@/components/licensee/estimate/estimateUiHelpers";
import {
  getLicenseeLocalization,
  type LicenseeMessages,
} from "@/lib/licensee/getLicenseeLocalization";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { licenseeErrorMessage } from "@/lib/licensee/licenseeErrorPresentation";
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
  messages?: LicenseeMessages;
  locale?: string;
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

type HideResponse = ApiErrorBody & {
  ok?: boolean;
  hidden?: boolean;
};

function isInFlightStatus(status: string | undefined | null): boolean {
  return status === "Queued" || status === "Processing";
}

export function LicenseeEstimateClient({
  subAccounts,
  messages = getLicenseeLocalization("en").messages,
  locale = "en-US",
}: LicenseeEstimateClientProps) {
  const estimate = messages.estimate;
  const howItWorks = useMemo(
    () => [
      { title: estimate.howClientTitle, copy: estimate.howClientCopy },
      { title: estimate.howProjectTitle, copy: estimate.howProjectCopy },
      { title: estimate.howPricingTitle, copy: estimate.howPricingCopy },
    ],
    [estimate],
  );
  const timeframeOptions = useMemo(
    () => [
      { value: "asap" as const, label: estimate.timeframeAsap },
      { value: "2_4_weeks" as const, label: estimate.timeframe2to4Weeks },
      { value: "1_3_months" as const, label: estimate.timeframe1to3Months },
      { value: "flexible" as const, label: estimate.timeframeFlexible },
    ],
    [estimate],
  );
  const prospectRemovedLabel =
    estimate.prospectRemoved || ESTIMATE_PROSPECT_REMOVED_LABEL;
  const prospectRemovedRegenerate =
    messages.errors.prospectRemovedRegenerate ||
    ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE;
  const prospectUnavailableRegenerate =
    messages.errors.prospectUnavailableRegenerate ||
    ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE;

  const [organizationId, setOrganizationId] = useState(
    subAccounts[0]?.organizationId ?? "",
  );
  /** Optional commercial Prospect target for create — id only; server resolves snapshot. */
  const [prospectId, setProspectId] = useState<string | null>(null);
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
  const [hideTarget, setHideTarget] =
    useState<PublicAthenaEstimateSummary | null>(null);
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);

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
          licenseeErrorMessage(
            messages,
            payload.error?.code,
            messages.errors.historyLoadFailed,
          ),
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
      setHistoryError(messages.errors.historyLoadFailed);
    } finally {
      setHistoryLoading(false);
    }
  }, [messages]);

  const pollDetail = useCallback(
    async (estimateId: string) => {
      try {
        const response = await fetch(`/api/licensee/estimate/${estimateId}`, {
          cache: "no-store",
        });
        const payload = await parseJsonResponse<DetailResponse>(response);
        if (activeIdRef.current !== estimateId) return;

        // Soft-hidden / unavailable while in-flight: stop polling and drop UI.
        if (response.status === 404 || payload.error?.code === "NOT_FOUND") {
          stopPolling();
          activeIdRef.current = null;
          setHistory((prev) => prev.filter((item) => item.id !== estimateId));
          setActiveEstimate((prev) =>
            prev?.id === estimateId ? null : prev,
          );
          return;
        }

        if (!payload.ok || !payload.estimate) return;

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
            licenseeErrorMessage(
              messages,
              payload.error?.code,
              messages.errors.historyLoadFailed,
            ),
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
          setHistoryError(messages.errors.historyLoadFailed);
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
  }, [stopPolling, messages]);

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
    setProspectId(null);
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
      setFormError(estimate.selectClient);
      return false;
    }
    const need = projectNeed.trim();
    if (need.length < ESTIMATE_PROJECT_NEED_MIN_LENGTH) {
      setFormError(estimate.describeNeed);
      return false;
    }
    if (need.length > ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed) {
      setFormError(messages.errors.validation);
      return false;
    }
    if (
      additionalContext.trim().length >
      ESTIMATE_REQUEST_FIELD_LIMITS.additionalContext
    ) {
      setFormError(messages.errors.validation);
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
      prospectId?: string;
    } = {
      organizationId,
      projectNeed: projectNeed.trim(),
    };
    const context = additionalContext.trim();
    if (context) body.additionalContext = context;
    if (timeframe) body.timeframe = timeframe;
    // Org-only: omit prospectId entirely (V26-compatible). Never send snapshots/context.
    if (prospectId) body.prospectId = prospectId;

    try {
      const response = await fetch("/api/licensee/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await parseJsonResponse<CreateResponse>(response);
      if (!response.ok || !payload.ok || !payload.estimate?.id) {
        setSubmitError(
          licenseeErrorMessage(
            messages,
            payload.error?.code,
            messages.errors.createEstimateFailed,
          ),
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
      setSubmitError(messages.errors.createEstimateFailed);
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
          licenseeErrorMessage(
            messages,
            payload.error?.code,
            messages.errors.openEstimateFailed,
          ),
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
      setSubmitError(messages.errors.openEstimateFailed);
    }
  }

  async function handleRegenerate() {
    if (!activeEstimate || regenerating) return;
    if (!activeEstimate.relationshipConnected) return;
    if (activeEstimate.prospectRemoved) {
      setSubmitError(
        messages.errors.prospectRemovedRegenerate ||
          ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE,
      );
      return;
    }

    setRegenerating(true);
    setSubmitError(null);
    try {
      const response = await fetch(
        `/api/licensee/estimate/${activeEstimate.id}/regenerate`,
        { method: "POST" },
      );
      const payload = await parseJsonResponse<RegenerateResponse>(response);
      if (!response.ok || !payload.ok || !payload.estimate?.id) {
        if (
          response.status === 409 ||
          payload.error?.code === "PROSPECT_TARGET_UNAVAILABLE"
        ) {
          setSubmitError(
            messages.errors.prospectUnavailableRegenerate ||
              ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE,
          );
          return;
        }
        setSubmitError(
          licenseeErrorMessage(
            messages,
            payload.error?.code,
            messages.errors.regenerateFailed,
          ),
        );
        return;
      }
      setActiveEstimate(payload.estimate);
      startPolling(payload.estimate.id);
      void refreshHistory();
    } catch {
      setSubmitError(messages.errors.regenerateFailed);
    } finally {
      setRegenerating(false);
    }
  }

  function requestHideEstimate(item: PublicAthenaEstimateSummary) {
    setHideError(null);
    setHideTarget(item);
  }

  function requestHideActiveEstimate() {
    if (!activeEstimate) return;
    const fromHistory = history.find((item) => item.id === activeEstimate.id);
    requestHideEstimate(
      fromHistory ?? {
        id: activeEstimate.id,
        organizationId: activeEstimate.organizationId,
        organizationNameSnapshot: activeEstimate.organizationNameSnapshot,
        request: activeEstimate.request,
        status: activeEstimate.status,
        generationStage: activeEstimate.generationStage,
        currencyCode: activeEstimate.currencyCode,
        geographyLabel: activeEstimate.geographyLabel,
        currencyResolution: activeEstimate.currencyResolution,
        recommendedClientPrice: activeEstimate.recommendedClientPrice,
        prospectId: activeEstimate.prospectId,
        prospectBusinessNameSnapshot:
          activeEstimate.prospectBusinessNameSnapshot,
        prospectRemoved: activeEstimate.prospectRemoved,
        createdAt: activeEstimate.createdAt,
        updatedAt: activeEstimate.updatedAt,
        errorCode: activeEstimate.errorCode,
        errorMessage: activeEstimate.errorMessage,
        relationshipConnected: activeEstimate.relationshipConnected,
      },
    );
  }

  function removeEstimateFromVisibleState(estimateId: string) {
    setHistory((prev) => prev.filter((item) => item.id !== estimateId));
    if (activeIdRef.current === estimateId) {
      stopPolling();
      activeIdRef.current = null;
    }
    setActiveEstimate((prev) => (prev?.id === estimateId ? null : prev));
  }

  async function confirmHideEstimate() {
    if (!hideTarget || hiding) return;
    const targetId = hideTarget.id;
    setHiding(true);
    setHideError(null);
    try {
      const response = await fetch(
        `/api/licensee/estimate/${targetId}/hide`,
        { method: "POST" },
      );
      const payload = await parseJsonResponse<HideResponse>(response);

      // Already hidden / absent — treat as unavailable and drop stale UI item.
      if (response.status === 404 || payload.error?.code === "NOT_FOUND") {
        removeEstimateFromVisibleState(targetId);
        setHideTarget(null);
        return;
      }

      if (!response.ok || !payload.ok) {
        setHideError(
          licenseeErrorMessage(
            messages,
            payload.error?.code,
            messages.errors.hideFailed,
          ),
        );
        return;
      }

      removeEstimateFromVisibleState(targetId);
      setHideTarget(null);
    } catch {
      setHideError(messages.errors.hideFailed);
    } finally {
      setHiding(false);
    }
  }

  async function refreshActiveEstimateDetail() {
    const estimateId = activeIdRef.current;
    if (!estimateId) return;
    try {
      const response = await fetch(`/api/licensee/estimate/${estimateId}`, {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<DetailResponse>(response);
      if (response.status === 404 || payload.error?.code === "NOT_FOUND") {
        removeEstimateFromVisibleState(estimateId);
        setSubmitError(messages.errors.estimateUnavailable);
        return;
      }
      if (!payload.ok || !payload.estimate) return;
      setActiveEstimate((prev) =>
        prev?.id === estimateId ? payload.estimate! : prev,
      );
      if (!isInFlightStatus(payload.estimate.status)) {
        stopPolling();
      }
    } catch {
      // Transient refresh failures stay silent; composer re-enables.
    }
  }

  const pkg = activeEstimate?.package ?? null;
  const inFlight = isInFlightStatus(activeEstimate?.status);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="max-w-4xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {estimate.eyebrow}
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          {estimate.heroTitle}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-white/55 md:text-lg">
          {estimate.heroBody}
        </p>
        <a
          href="#athena-estimate-form"
          className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
        >
          {estimate.createCta}
        </a>
        <p className="mt-4 text-xs tracking-wide text-white/40">
          {estimate.heroFootnote}
        </p>
      </section>

      {/* How it works */}
      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {estimate.howEyebrow}
        </div>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          {estimate.howTitle}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {howItWorks.map((item) => (
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
          {estimate.howDisclaimer}
        </p>
      </section>

      {/* Form */}
      <section
        id="athena-estimate-form"
        className="scroll-mt-8 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {estimate.formEyebrow}
        </div>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          {estimate.formTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
          {estimate.formIntro}
        </p>

        {subAccounts.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
            {estimate.noSubAccounts}{" "}
            <Link
              href="/licensee/sub-accounts/new"
              className="font-medium text-[var(--athena-orange)] underline-offset-2 hover:underline"
            >
              {estimate.createSubAccountLink}
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="estimate-organization"
                className="block text-sm font-medium text-white/80"
              >
                {estimate.clientLabel}
              </label>
              <select
                id="estimate-organization"
                name="organizationId"
                required
                value={organizationId}
                onChange={(event) => {
                  setOrganizationId(event.target.value);
                  setProspectId(null);
                }}
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

            <EstimateProspectSelect
              key={organizationId}
              organizationId={organizationId}
              value={prospectId}
              onChange={setProspectId}
              disabled={submitting}
              messages={messages}
            />

            <div>
              <label
                htmlFor="estimate-project-need"
                className="block text-sm font-medium text-white/80"
              >
                {estimate.projectNeedLabel}
              </label>
              <textarea
                id="estimate-project-need"
                name="projectNeed"
                required
                rows={5}
                maxLength={ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed}
                value={projectNeed}
                onChange={(event) => setProjectNeed(event.target.value)}
                placeholder={estimate.projectNeedPlaceholder}
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
                {estimate.additionalContextLabel}{" "}
                <span className="font-normal text-white/40">
                  {messages.common.optional}
                </span>
              </label>
              <textarea
                id="estimate-additional-context"
                name="additionalContext"
                rows={3}
                maxLength={ESTIMATE_REQUEST_FIELD_LIMITS.additionalContext}
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                placeholder={estimate.additionalContextPlaceholder}
                className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30"
              />
            </div>

            <div>
              <label
                htmlFor="estimate-timeframe"
                className="block text-sm font-medium text-white/80"
              >
                {estimate.timeframeLabel}{" "}
                <span className="font-normal text-white/40">
                  {messages.common.optional}
                </span>
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
                <option value="">{estimate.timeframeUnspecified}</option>
                {timeframeOptions.map((option) => (
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
              {submitting ? estimate.creating : estimate.generate}
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
              {estimate.resultEyebrow}
            </div>
            {!activeEstimate ? (
              <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
                {estimate.resultEmptyTitle}
              </h2>
            ) : estimateHasProspectTarget(activeEstimate) ? (
              <div className="mt-3" data-estimate-target-display="prospect">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/40">
                  {estimate.estimateFor}
                </p>
                <h2 className="mt-1 text-2xl font-semibold md:text-3xl">
                  {activeEstimate.prospectBusinessNameSnapshot}
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  {estimate.via}{" "}
                  <span className="font-medium text-white/75">
                    {activeEstimate.organizationNameSnapshot}
                  </span>
                </p>
                {activeEstimate.prospectRemoved ? (
                  <p
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70"
                    data-estimate-prospect-removed="true"
                  >
                    <span aria-hidden="true">•</span>
                    {prospectRemovedLabel}
                  </p>
                ) : null}
              </div>
            ) : (
              <h2
                className="mt-3 text-2xl font-semibold md:text-3xl"
                data-estimate-target-display="organization"
              >
                {activeEstimate.organizationNameSnapshot}
              </h2>
            )}
          </div>
          {activeEstimate ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={requestHideActiveEstimate}
                disabled={hiding}
                aria-label={estimate.hideFromHistoryAria}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/55 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
              >
                <HideTrashIcon />
                {messages.common.hide}
              </button>
              <button
                type="button"
                onClick={handleCreateAnother}
                className="text-sm font-medium text-[var(--athena-orange)] hover:underline"
              >
                {estimate.createAnother}
              </button>
            </div>
          ) : null}
        </div>
        {submitError && activeEstimate ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {submitError}
          </p>
        ) : null}

        {!activeEstimate ? (
          <p className="mt-6 text-sm leading-6 text-white/45">
            {estimate.resultEmptyBody}
          </p>
        ) : null}

        {activeEstimate && inFlight ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 px-5 py-6">
            <div className="text-sm font-semibold text-white">
              {activeEstimate.status === "Queued"
                ? estimate.queuedTitle
                : estimate.generatingTitle}
            </div>
            <p className="mt-2 text-sm text-white/55">
              {estimateStageLabel(activeEstimate.generationStage, messages) ||
                (activeEstimate.status === "Queued"
                  ? estimate.queuedBody
                  : estimate.generatingBody)}
            </p>
            <p className="mt-4 text-xs text-white/35">
              {estimate.inFlightFootnote}
            </p>
          </div>
        ) : null}

        {activeEstimate?.status === "Processing Failed" ? (
          <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-6">
            <div className="text-sm font-semibold text-red-100">
              {estimate.failedTitle}
            </div>
            <p className="mt-2 text-sm text-red-100/80">
              {activeEstimate.errorMessage?.trim() || estimate.failedFallback}
            </p>
            {activeEstimate.relationshipConnected &&
            !activeEstimate.prospectRemoved ? (
              <button
                type="button"
                disabled={regenerating}
                onClick={() => void handleRegenerate()}
                className="mt-5 inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
              >
                {regenerating ? estimate.starting : estimate.tryAgain}
              </button>
            ) : null}
            {activeEstimate.prospectRemoved ? (
              <p
                className="mt-5 text-sm text-white/45"
                data-estimate-regenerate-unavailable="prospect-removed"
              >
                {prospectRemovedRegenerate}
              </p>
            ) : null}
          </div>
        ) : null}

        {activeEstimate?.status === "Ready" && pkg ? (
          <div className="mt-8 space-y-6">
            {!activeEstimate.relationshipConnected ? (
              <div className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                {estimate.disconnected}
              </div>
            ) : null}

            <div className="rounded-2xl border border-[var(--athena-orange)]/30 bg-gradient-to-br from-black/40 to-[#1a1410] px-6 py-8">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--athena-orange)]">
                {estimate.recommendedPrice}
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {formatEstimateMoney(
                  pkg.recommendedClientPrice.amount,
                  pkg.recommendedClientPrice.currencyCode,
                  locale,
                )}
              </div>
              <div className="mt-4 text-sm text-white/55">
                {estimate.recommendedRange}{" "}
                <span className="font-medium text-white/85">
                  {formatEstimateMoney(
                    pkg.recommendedPriceRange.low.amount,
                    pkg.recommendedPriceRange.low.currencyCode,
                    locale,
                  )}{" "}
                  →{" "}
                  {formatEstimateMoney(
                    pkg.recommendedPriceRange.high.amount,
                    pkg.recommendedPriceRange.high.currencyCode,
                    locale,
                  )}
                </span>
              </div>
              {pkg.geographyLabel ? (
                <p className="mt-3 text-sm text-white/45">
                  {estimate.geography} {pkg.geographyLabel}
                </p>
              ) : null}
              {pkg.currencyResolution === "fallback" ? (
                <p className="mt-2 text-sm text-amber-100/80">
                  {estimate.currencyFallback}
                </p>
              ) : null}
            </div>

            <ResultSection title={estimate.scopeInterpretation}>
              {pkg.scopeInterpretation}
            </ResultSection>
            <ResultSection title={estimate.pricingRationale}>
              {pkg.pricingRationale}
            </ResultSection>
            <ResultSection title={estimate.keyPriceDrivers}>
              <ul className="list-disc space-y-2 pl-5">
                {pkg.keyPriceDrivers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ResultSection>
            <ResultSection title={estimate.suggestedPositioning}>
              {pkg.suggestedClientPositioning}
            </ResultSection>
            <ResultSection title={estimate.risksAssumptions}>
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
              {activeEstimate.prospectRemoved ? (
                <p
                  className="text-sm text-white/40"
                  data-estimate-regenerate-unavailable="prospect-removed"
                >
                  {prospectRemovedRegenerate}
                </p>
              ) : activeEstimate.relationshipConnected ? (
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={() => void handleRegenerate()}
                  className="inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
                  data-estimate-regenerate-action="true"
                >
                  {regenerating ? estimate.starting : estimate.regenerate}
                </button>
              ) : (
                <p className="text-sm text-white/40">
                  {estimate.regenerateUnavailableDisconnected}
                </p>
              )}
              <button
                type="button"
                onClick={handleCreateAnother}
                className="inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                {estimate.createAnother}
              </button>
            </div>

            <EstimateAskAthenaPanel
              estimateId={activeEstimate.id}
              relationshipConnected={activeEstimate.relationshipConnected}
              onEstimateUnavailable={() =>
                removeEstimateFromVisibleState(activeEstimate.id)
              }
              onNotReady={() => {
                void refreshActiveEstimateDetail();
              }}
              messages={messages}
            />
          </div>
        ) : null}
      </section>

      {/* Estimate History */}
      <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {estimate.historyEyebrow}
        </div>
        <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
          {estimate.historyTitle}
        </h2>
        <p className="mt-3 text-sm text-white/45">
          {estimate.historyIntro}
        </p>

        {historyLoading ? (
          <p className="mt-6 text-sm text-white/40">{estimate.historyLoading}</p>
        ) : null}
        {historyError ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {historyError}
          </p>
        ) : null}
        {!historyLoading && !historyError && history.length === 0 ? (
          <p className="mt-6 text-sm text-white/40">
            {estimate.historyEmpty}
          </p>
        ) : null}

        {hideError && !hideTarget ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {hideError}
          </p>
        ) : null}

        <ul className="mt-6 space-y-3">
          {history.map((item) => {
            const selected = activeEstimate?.id === item.id;
            return (
              <li key={item.id}>
                <div
                  className={`flex items-stretch gap-1 rounded-2xl border transition ${
                    selected
                      ? "border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                  data-estimate-history-row="true"
                >
                  <button
                    type="button"
                    onClick={() => void openHistoryItem(item.id)}
                    className="min-w-0 flex-1 px-4 py-4 text-left transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">
                            {formatEstimateHistoryPrimaryLabel(item)}
                          </span>
                          <StatusBadge status={item.status} messages={messages} />
                          {item.prospectRemoved ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/70"
                              data-estimate-prospect-removed="true"
                            >
                              <span aria-hidden="true">•</span>
                              {prospectRemovedLabel}
                            </span>
                          ) : null}
                          {!item.relationshipConnected ? (
                            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-100">
                              {estimate.disconnected}
                            </span>
                          ) : null}
                        </div>
                        {estimateHasProspectTarget(item) ? (
                          <p className="mt-1 text-xs text-white/40">
                            {estimate.via} {item.organizationNameSnapshot}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm text-white/50">
                          {truncateProjectNeed(item.request.projectNeed)}
                        </p>
                        <p className="mt-1 text-xs text-white/35">
                          {formatEstimateDate(item.createdAt, locale)}
                        </p>
                      </div>
                      <div className="shrink-0 text-sm font-medium text-white/80">
                        {item.status === "Ready" && item.recommendedClientPrice
                          ? formatEstimateMoney(
                              item.recommendedClientPrice.amount,
                              item.recommendedClientPrice.currencyCode,
                              locale,
                            )
                          : "—"}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-start pt-3 pr-3">
                    <button
                      type="button"
                      aria-label={interpolateTenantMessage(
                        estimate.hideEstimateAria,
                        { name: formatEstimateHistoryPrimaryLabel(item) },
                      )}
                      data-estimate-hide-action="true"
                      disabled={hiding && hideTarget?.id === item.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        requestHideEstimate(item);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-white/45 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-50"
                    >
                      <HideTrashIcon />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Quote cross-link */}
      <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-6 text-center md:p-10">
        <h2 className="text-2xl font-semibold md:text-3xl">
          {estimate.quoteTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55">
          {estimate.quoteBody}
        </p>
        <Link
          href="/licensee/quote"
          className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
        >
          {estimate.quoteCta}
        </Link>
        <p className="mt-4 text-xs text-white/35">
          {estimate.quoteFootnote}
        </p>
      </section>

      {hideTarget ? (
        <HideEstimateConfirmDialog
          targetLabel={formatEstimateHistoryPrimaryLabel(hideTarget)}
          organizationName={
            estimateHasProspectTarget(hideTarget)
              ? hideTarget.organizationNameSnapshot
              : null
          }
          pending={hiding}
          error={hideError}
          messages={messages}
          onCancel={() => {
            if (hiding) return;
            setHideTarget(null);
            setHideError(null);
          }}
          onConfirm={() => void confirmHideEstimate()}
        />
      ) : null}
    </div>
  );
}

function HideEstimateConfirmDialog({
  targetLabel,
  organizationName,
  pending,
  error,
  messages,
  onCancel,
  onConfirm,
}: {
  targetLabel: string;
  organizationName: string | null;
  pending: boolean;
  error: string | null;
  messages: LicenseeMessages;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hide-estimate-title"
        className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
        data-estimate-hide-confirm="true"
      >
        <h2
          id="hide-estimate-title"
          className="text-xl font-semibold text-white"
        >
          {messages.estimate.hideDialogTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/55">
          {messages.estimate.hideDialogBody}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/70">{targetLabel}</p>
        {organizationName ? (
          <p className="mt-1 text-sm leading-6 text-white/40">
            {messages.estimate.via} {organizationName}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-60"
          >
            {messages.common.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:opacity-60"
          >
            {pending ? messages.estimate.hiding : messages.estimate.hideConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function HideTrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path
        d="M4.5 6.5h11M8 6.5V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 6.5l.6 8.2a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function StatusBadge({
  status,
  messages,
}: {
  status: string;
  messages: LicenseeMessages;
}) {
  const styles =
    status === "Ready"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : status === "Processing Failed"
        ? "border-red-400/30 bg-red-500/10 text-red-100"
        : "border-white/15 bg-white/5 text-white/70";
  const label =
    status === "Queued"
      ? messages.estimate.statusQueued
      : status === "Processing"
        ? messages.estimate.statusProcessing
        : status === "Ready"
          ? messages.estimate.statusReady
          : status === "Processing Failed"
            ? messages.estimate.statusFailed
            : status;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {label}
    </span>
  );
}
