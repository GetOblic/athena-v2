"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Telescope } from "lucide-react";
import { SEO_CHOICE_CARD } from "@/components/seo/seoPagePresentation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { en } from "@/lib/tenantI18n/messages/en";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

type SeoReportGenerateFormProps = {
  messages?: TenantMessages;
  technicalSelectable?: boolean;
};

export function SeoReportGenerateForm({
  messages,
  technicalSelectable = true,
}: SeoReportGenerateFormProps) {
  const copy = messages?.seo.new ?? en.seo.new;
  const lenses = messages?.seo.lenses ?? en.seo.lenses;
  const visibility = messages?.seo.visibility ?? en.seo.visibility;
  const expand = messages?.seo.expand ?? en.seo.expand;
  const collapse = messages?.seo.collapse ?? en.seo.collapse;
  const router = useRouter();
  const submittingRef = useRef(false);
  const [generationType, setGenerationType] =
    useState<SeoGenerationType>("intelligence");
  const [name, setName] = useState("");
  const [guidance, setGuidance] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [geography, setGeography] = useState("");
  const [constraints, setConstraints] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (submittingRef.current) return;
    if (generationType === "technical" && !technicalSelectable) return;
    submittingRef.current = true;
    setSubmitting(true);
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
      setSubmitting(false);
    }
  }

  const extraFields = [
    [copy.focus, focusArea, setFocusArea, 500],
    [copy.placeOrMarket, geography, setGeography, 200],
    [copy.limitsToRespect, constraints, setConstraints, 1000],
  ] as const;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleGenerate();
      }}
      className="space-y-6"
    >
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.chooseWhat}
        </legend>
        <div className="grid gap-3">
          <label
            className={
              generationType === "intelligence"
                ? SEO_CHOICE_CARD.strategySelected
                : SEO_CHOICE_CARD.strategy
            }
          >
            <input
              type="radio"
              name="generationType"
              value="intelligence"
              checked={generationType === "intelligence"}
              onChange={() => setGenerationType("intelligence")}
              className="mt-1"
            />
            <span
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300"
              aria-hidden="true"
            >
              <Telescope size={16} />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold text-white">
                {lenses.intelligence}
              </span>
              <span className="mt-1 block text-sm leading-6 text-white/50">
                {visibility.strategyCardHelp}
              </span>
            </span>
          </label>
          <label
            className={
              !technicalSelectable
                ? SEO_CHOICE_CARD.technicalDisabled
                : generationType === "technical"
                  ? SEO_CHOICE_CARD.technicalSelected
                  : SEO_CHOICE_CARD.technical
            }
          >
            <input
              type="radio"
              name="generationType"
              value="technical"
              checked={generationType === "technical"}
              disabled={!technicalSelectable}
              onChange={() => {
                if (technicalSelectable) setGenerationType("technical");
              }}
              className="mt-1"
            />
            <span
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300"
              aria-hidden="true"
            >
              <Gauge size={16} />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold text-white">
                {lenses.technical}
              </span>
              <span className="mt-1 block text-sm leading-6 text-white/50">
                {visibility.healthCardHelp}
              </span>
              {!technicalSelectable ? (
                <span className="mt-2 block text-sm leading-6 text-white/55">
                  {copy.technicalNeedsRicher}{" "}
                  <Link
                    href="/identity"
                    className="text-[var(--athena-orange)] underline-offset-2 hover:underline"
                  >
                    {copy.openDefineYourBusiness}
                  </Link>
                </span>
              ) : null}
            </span>
          </label>
        </div>
      </fieldset>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          {copy.nameThisAnalysis}
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
          {copy.keepInMind}
        </span>
        <textarea
          value={guidance}
          onChange={(event) => setGuidance(event.target.value)}
          className="min-h-[160px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
          placeholder={copy.guidancePlaceholder}
          maxLength={4000}
        />
      </label>

      <AthenaCollapsibleSection
        title={copy.moreDetail}
        defaultOpen={false}
        showToggleLabel
        toggleLabels={{ expand, collapse }}
      >
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

      {error ? <p className="break-words text-sm text-rose-200">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting || (generationType === "technical" && !technicalSelectable)}
        className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? copy.starting : copy.startAnalysis}
      </button>
    </form>
  );
}
