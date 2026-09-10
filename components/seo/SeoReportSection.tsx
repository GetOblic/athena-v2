"use client";

import type { ReactNode } from "react";
import {
  CopyButton,
  type CopyButtonChrome,
} from "@/components/deployment/CopyButton";
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

export type SeoReportSectionChrome = {
  emptyValue?: string;
  readingTime?: (minutes: number) => string;
  starsAria?: (stars: number) => string;
  expand?: string;
  collapse?: string;
  copy?: CopyButtonChrome | null;
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
  chrome?: SeoReportSectionChrome | null;
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
  tone?: "default" | "intelligence";
  iconSize?: "lg" | "sm";
  copyVariant?: "default" | "utility";
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
  chrome,
  icon,
  iconClassName,
  className,
  tone = "default",
  iconSize = "lg",
  copyVariant = "default",
}: SeoReportSectionProps) {
  const corpus =
    readingCorpus ??
    [summary, ...fields.map((field) => field.value)]
      .filter(Boolean)
      .join("\n");
  const readingMinutes = estimateReadingMinutes(corpus);
  const emptyValue = chrome?.emptyValue ?? "—";
  const readingLabel = chrome?.readingTime
    ? chrome.readingTime(readingMinutes)
    : formatReadingTime(readingMinutes);
  const starsAria = chrome?.starsAria
    ? chrome.starsAria(stars ?? 0)
    : `${stars} of 5 stars`;

  return (
    <AthenaCollapsibleSection
      title={title}
      eyebrow={eyebrow}
      defaultOpen={defaultOpen}
      summary={summary}
      showToggleLabel={tone === "default"}
      toggleLabels={
        chrome?.expand && chrome?.collapse
          ? { expand: chrome.expand, collapse: chrome.collapse }
          : null
      }
      icon={icon}
      iconClassName={iconClassName}
      className={className}
      tone={tone}
      iconSize={iconSize}
      headerMeta={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/50">
          {typeof stars === "number" ? (
            <span
              className="tracking-[0.12em] text-[var(--athena-orange)]"
              aria-label={starsAria}
            >
              {formatStarRating(stars)}
            </span>
          ) : null}
          <span>{readingLabel}</span>
        </div>
      }
      contentClassName="space-y-5"
    >
      {children}
      {fields.map((field) => (
        <div key={field.label} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 break-all text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              {field.label}
            </div>
            <CopyButton
              text={field.value}
              tracking={null}
              showContinue={false}
              chrome={chrome?.copy}
              variant={copyVariant}
            />
          </div>
          <div className="whitespace-pre-wrap break-all rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
            {field.value || emptyValue}
          </div>
        </div>
      ))}
      {footer}
    </AthenaCollapsibleSection>
  );
}
