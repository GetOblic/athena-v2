"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  getLicenseeLocalization,
  type LicenseeMessages,
} from "@/lib/licensee/getLicenseeLocalization";
import { licenseeErrorMessage } from "@/lib/licensee/licenseeErrorPresentation";
import { ESTIMATE_PROSPECT_NONE_OPTION_LABEL } from "@/components/licensee/estimate/estimateUiHelpers";

export type EstimateProspectOption = {
  id: string;
  businessName: string;
};

type ProspectsResponse = {
  ok?: boolean;
  prospects?: EstimateProspectOption[];
  error?: { code?: string; message?: string };
};

type EstimateProspectSelectProps = {
  organizationId: string;
  value: string | null;
  onChange: (prospectId: string | null) => void;
  /** Extra disable (e.g. while Estimate is submitting). */
  disabled?: boolean;
  messages?: LicenseeMessages;
};

type LoadStatus = "idle" | "loading" | "ready" | "empty" | "error";

/**
 * Compact optional Prospect selector for Licensee Master Estimate create.
 * Loads authorized Prospects for the selected sub-account only.
 * Emits prospectId; never exposes intelligence / contact fields.
 *
 * Parent should remount with key={organizationId} and clear selection on org change.
 */
export function EstimateProspectSelect({
  organizationId,
  value,
  onChange,
  disabled = false,
  messages = getLicenseeLocalization("en").messages,
}: EstimateProspectSelectProps) {
  const [options, setOptions] = useState<EstimateProspectOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = organizationId.trim();
    const controller = new AbortController();
    let cancelled = false;

    if (!orgId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setOptions([]);
        setError(null);
        setStatus("idle");
      });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setOptions([]);
      setError(null);
      setStatus("loading");
    });

    const load = async () => {
      try {
        const response = await fetch(
          `/api/licensee/estimate/prospects?organizationId=${encodeURIComponent(orgId)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = await parseJsonResponse<ProspectsResponse>(response);
        if (cancelled || controller.signal.aborted) return;

        if (!response.ok || !payload.ok || !Array.isArray(payload.prospects)) {
          setOptions([]);
          setError(
            licenseeErrorMessage(
              messages,
              payload.error?.code,
              messages.estimate.prospectLoadFailed,
            ),
          );
          setStatus("error");
          return;
        }

        // Defense-in-depth: only id + businessName enter the selector.
        const next = payload.prospects
          .map((item) => ({
            id: String(item.id ?? "").trim(),
            businessName: String(item.businessName ?? "").trim(),
          }))
          .filter((item) => item.id && item.businessName);

        setOptions(next);
        setError(null);
        setStatus(next.length === 0 ? "empty" : "ready");
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOptions([]);
        setError(messages.estimate.prospectLoadFailed);
        setStatus("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Refetch is keyed to the selected sub-account only.
  }, [organizationId]);

  const loading = status === "loading";
  const selectDisabled =
    disabled || loading || status === "error" || !organizationId.trim();
  const noneLabel =
    messages.estimate.prospectNone ?? ESTIMATE_PROSPECT_NONE_OPTION_LABEL;

  return (
    <div data-estimate-prospect-select="true">
      <label
        htmlFor="estimate-prospect"
        className="block text-sm font-medium text-white/80"
      >
        {messages.estimate.prospectLabel}{" "}
        <span className="font-normal text-white/40">
          {messages.common.optional}
        </span>
      </label>
      <select
        id="estimate-prospect"
        name="prospectId"
        value={value ?? ""}
        disabled={selectDisabled}
        aria-busy={loading || undefined}
        aria-describedby={
          loading || status === "error" || status === "empty"
            ? "estimate-prospect-status"
            : undefined
        }
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next ? next : null);
        }}
        className="mt-2 w-full rounded-2xl border border-white/20 bg-[#161922] px-4 py-3 text-sm text-white outline-none focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{noneLabel}</option>
        {options.map((prospect) => (
          <option key={prospect.id} value={prospect.id}>
            {prospect.businessName}
          </option>
        ))}
      </select>
      {loading || status === "error" || status === "empty" ? (
        <p
          id="estimate-prospect-status"
          className={`mt-1.5 text-xs ${
            status === "error" ? "text-red-300" : "text-white/40"
          }`}
          role={status === "error" ? "alert" : undefined}
        >
          {loading
            ? messages.estimate.prospectLoading
            : status === "error"
              ? error || messages.estimate.prospectLoadFailed
              : messages.estimate.prospectEmpty}
        </p>
      ) : null}
    </div>
  );
}
