"use client";

import type { ReactNode } from "react";
import { CopyButton } from "@/components/deployment/CopyButton";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import {
  estimateReadingMinutes,
  formatReadingTime,
  formatStarRating,
} from "@/services/seo/seoReportPresentation";

export type SeoReportField = {
  label: string;
  value: string;
};

type SeoReportSectionProps = {
  title: string;
  eyebrow?: string;
  fields?: SeoReportField[];
  children?: ReactNode;
  defaultOpen?: boolean;
  footer?: ReactNode;
  summary?: string;
  stars?: number;
  readingCorpus?: string;
};

export function SeoReportSection({
  title,
  eyebrow,
  fields = [],
  children,
  defaultOpen = false,
  footer,
  summary,
  stars,
  readingCorpus,
}: SeoReportSectionProps) {
  const corpus =
    readingCorpus ??
    [summary, ...fields.map((field) => field.value)]
      .filter(Boolean)
      .join("\n");
  const readingMinutes = estimateReadingMinutes(corpus);

  return (
    <AthenaCollapsibleSection
      title={title}
      eyebrow={eyebrow}
      defaultOpen={defaultOpen}
      summary={summary}
      showToggleLabel
      headerMeta={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/50">
          {typeof stars === "number" ? (
            <span
              className="tracking-[0.12em] text-[var(--athena-orange)]"
              aria-label={`${stars} of 5 stars`}
            >
              {formatStarRating(stars)}
            </span>
          ) : null}
          <span>{formatReadingTime(readingMinutes)}</span>
        </div>
      }
      contentClassName="space-y-5"
    >
      {children}
      {fields.map((field) => (
        <div key={field.label} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              {field.label}
            </div>
            <CopyButton
              text={field.value}
              tracking={null}
              showContinue={false}
            />
          </div>
          <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
            {field.value || "—"}
          </div>
        </div>
      ))}
      {footer}
    </AthenaCollapsibleSection>
  );
}
