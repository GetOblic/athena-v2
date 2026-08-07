"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

/** Athena success-green treatment — same language as ThinkDifferentlyButton. */
const TECHNICAL_SEO_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-2xl border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 px-6 py-3 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50 disabled:cursor-not-allowed disabled:opacity-60";

export function SeoReportGenerateForm() {
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
              ? "Failed to start Technical SEO generation."
              : "Failed to start SEO generation."),
        );
        return;
      }

      router.push(`/seo/${payload.report.id}`);
      router.refresh();
    } catch {
      setError(
        generationType === "technical"
          ? "Failed to start Technical SEO generation."
          : "Failed to start SEO generation.",
      );
    } finally {
      submittingRef.current = false;
      setSubmittingType(null);
    }
  }

  const submitting = submittingType != null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleGenerate("intelligence");
      }}
      className="space-y-6"
    >
      <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
        <p className="text-sm leading-7 text-white/60">
          A brief is optional. Choose Generate SEO Intelligence for strategic
          content and visibility opportunities from existing Brain, Deep Website
          Intelligence, Personas, Communities, and Discussions. Choose Generate
          Technical SEO for an evidence-backed technical package from refreshed
          Website Intelligence.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Report name (optional)
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          placeholder="Untitled SEO Report"
          maxLength={120}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Guidance (optional)
        </span>
        <textarea
          value={guidance}
          onChange={(event) => setGuidance(event.target.value)}
          className="min-h-[160px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          placeholder="Optional freeform direction for the SEO report. Leave blank to let Athena infer the strongest opportunities."
          maxLength={4000}
        />
      </label>

      <AthenaCollapsibleSection title="More detail" defaultOpen={false}>
        <div className="space-y-4">
          {(
            [
              ["Focus area", focusArea, setFocusArea, 500],
              ["Geography", geography, setGeography, 200],
              ["Constraints", constraints, setConstraints, 1000],
            ] as const
          ).map(([label, value, setter, max]) => (
            <label key={label} className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                {label} (optional)
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
            ? "Starting…"
            : "Generate SEO Intelligence"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleGenerate("technical")}
          className={TECHNICAL_SEO_BUTTON_CLASS}
        >
          {submittingType === "technical"
            ? "Starting…"
            : "Generate Technical SEO"}
        </button>
      </div>
    </form>
  );
}
