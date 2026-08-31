"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

/** Athena success-green treatment — same language as ThinkDifferentlyButton. */
const TECHNICAL_SEO_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-2xl border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-6 py-3 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50 disabled:cursor-not-allowed disabled:opacity-60";

type SeoReportGenerateFormProps = {
  messages?: TenantMessages;
};

export function SeoReportGenerateForm({
  messages,
}: SeoReportGenerateFormProps) {
  const copy = messages?.seo.new ?? en.seo.new;
  const router = useRouter();
  const submittingRef = useRef(false);
  const [name, setName] = useState("");
  const [guidance, setGuidance] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [geography, setGeography] = useState("");
  const [constraints, setConstraints] = useState("");
  const [submittingType, setSubmittingType] =
    useState<SeoGenerationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(generationType: SeoGenerationType) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmittingType(generationType);
    setError(null);

    try {
      const response = await fetch("/api/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          guidance: guidance.trim() || undefined,
          focusArea: focusArea.trim() || undefined,
          geography: geography.trim() || undefined,
          constraints: constraints.trim() || undefined,
          generationType,
        }),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        report?: { id?: string };
        error?: { message?: string };
      }>(response);

      if (!payload.ok || !payload.report?.id) {
        setError(
          payload.error?.message ||
            (generationType === "technical"
              ? copy.generateTechnicalFailed
              : copy.generateFailed),
        );
        return;
      }

      router.push(`/seo/${payload.report.id}`);
      router.refresh();
    } catch {
      setError(
        generationType === "technical"
          ? copy.generateTechnicalFailed
          : copy.generateFailed,
      );
    } finally {
      submittingRef.current = false;
      setSubmittingType(null);
    }
  }

  const submitting = submittingType != null;
  const extraFields = [
    [copy.focusAreaLabel, focusArea, setFocusArea, 500],
    [copy.geographyLabel, geography, setGeography, 200],
    [copy.constraintsLabel, constraints, setConstraints, 1000],
  ] as const;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleGenerate("intelligence");
      }}
      className="space-y-6"
    >
      <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
        <p className="text-sm leading-7 text-white/60">{copy.briefOptional}</p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.nameLabel}
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          placeholder={copy.namePlaceholder}
          maxLength={120}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.guidanceLabel}
        </span>
        <textarea
          value={guidance}
          onChange={(event) => setGuidance(event.target.value)}
          className="min-h-[160px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          placeholder={copy.guidancePlaceholder}
          maxLength={4000}
        />
      </label>

      <AthenaCollapsibleSection title={copy.moreDetail} defaultOpen={false}>
        <div className="space-y-4">
          {extraFields.map(([label, value, setter, max]) => (
            <label key={label} className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                {label}
              </span>
              <textarea
                value={value}
                onChange={(event) => setter(event.target.value)}
                className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
                maxLength={max}
              />
            </label>
          ))}
        </div>
      </AthenaCollapsibleSection>

      {error ? <p className="text-sm text-rose-200">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submittingType === "intelligence"
            ? copy.starting
            : copy.generateIntelligence}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleGenerate("technical")}
          className={TECHNICAL_SEO_BUTTON_CLASS}
        >
          {submittingType === "technical"
            ? copy.starting
            : copy.generateTechnical}
        </button>
      </div>
    </form>
  );
}
