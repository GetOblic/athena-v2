"use client";

import { useState, type ReactNode } from "react";
import {
  CopyButton,
  type CopyButtonChrome,
} from "@/components/deployment/CopyButton";
import { SeoPriorityBadge } from "@/components/seo/SeoPriorityBadge";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import type {
  SeoFutureActionKind,
  SeoPriorityVisual,
} from "@/services/seo/seoReportPresentation";

export type SeoRecommendationCardChrome = {
  whyLabel?: string;
  evidenceLabel?: string;
  impactLabel?: string;
  effortLabel?: string;
  actionLabel?: string;
  pagesLabel?: string;
  expand?: string;
  collapse?: string;
  copyWhyPrefix?: (why: string) => string;
  copyImpactPrefix?: (impact: string) => string;
  copyEvidencePrefix?: (evidence: string) => string;
  copy?: CopyButtonChrome | null;
};

type SeoRecommendationCardProps = {
  title: string;
  why?: string;
  evidence?: string[];
  impact?: string;
  priorityVisual?: SeoPriorityVisual;
  priorityLabel?: string;
  priorityClassName?: string;
  effort?: string;
  recommendedAction?: string;
  affectedPages?: string[];
  noticed?: string;
  noticedLabel?: string;
  meta?: string;
  /** Reserved for future contextual generation actions — not rendered as CTAs yet. */
  futureActionKinds?: SeoFutureActionKind[];
  footer?: ReactNode;
  chrome?: SeoRecommendationCardChrome | null;
  defaultOpen?: boolean;
  evidenceDefaultOpen?: boolean;
};

function FieldBlock({
  label,
  value,
  emphasize = false,
  breakAll = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  breakAll?: boolean;
}) {
  if (!value.trim()) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <p
        className={`${
          emphasize
            ? "text-sm leading-7 text-white/90"
            : "text-sm leading-7 text-white/70"
        } ${breakAll ? "break-all" : "break-words"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function SeoRecommendationCard({
  title,
  why = "",
  evidence = [],
  impact,
  priorityVisual,
  priorityLabel,
  priorityClassName,
  effort,
  recommendedAction,
  affectedPages = [],
  noticed,
  noticedLabel,
  meta,
  futureActionKinds = [],
  footer,
  chrome,
  defaultOpen = true,
  evidenceDefaultOpen = false,
}: SeoRecommendationCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const whyLabel = chrome?.whyLabel ?? "Why Athena recommends this";
  const evidenceLabel = chrome?.evidenceLabel ?? "Evidence";
  const impactLabel = chrome?.impactLabel ?? "Expected business impact";
  const effortLabel = chrome?.effortLabel ?? "Effort";
  const actionLabel = chrome?.actionLabel ?? "Recommended action";
  const pagesLabel = chrome?.pagesLabel ?? "Affected pages";
  const expand = chrome?.expand ?? "▼ Expand";
  const collapse = chrome?.collapse ?? "▲ Collapse";
  const resolvedPriority = priorityLabel || priorityVisual?.label || "";
  const collapsedSummary = [resolvedPriority, title, effort]
    .filter((part) => part && String(part).trim())
    .join(" · ");
  const copyText = [
    title,
    why
      ? chrome?.copyWhyPrefix
        ? chrome.copyWhyPrefix(why)
        : `Why Athena recommends this: ${why}`
      : "",
    noticed ? noticed : "",
    impact
      ? chrome?.copyImpactPrefix
        ? chrome.copyImpactPrefix(impact)
        : `Expected business impact: ${impact}`
      : "",
    effort ? `${effortLabel}: ${effort}` : "",
    recommendedAction ? `${actionLabel}: ${recommendedAction}` : "",
    affectedPages.length ? `${pagesLabel}: ${affectedPages.join(", ")}` : "",
    evidence.length
      ? chrome?.copyEvidencePrefix
        ? chrome.copyEvidencePrefix(evidence.join("; "))
        : `Evidence: ${evidence.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <article
      className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5"
      data-future-action-kinds={futureActionKinds.join(",")}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
          aria-expanded={open}
        >
          <div className="min-w-0 space-y-3">
            {priorityVisual ? (
              <SeoPriorityBadge visual={priorityVisual} />
            ) : resolvedPriority ? (
              <span
                className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                  priorityClassName ??
                  "border-white/15 bg-white/[0.04] text-white/70"
                }`}
              >
                <span className="min-w-0 break-words">{resolvedPriority}</span>
              </span>
            ) : null}
            <h3 className="break-words text-lg font-semibold tracking-tight text-white">
              {title}
            </h3>
            {!open ? (
              <p className="break-words text-sm leading-6 text-white/55">
                {collapsedSummary}
              </p>
            ) : null}
            {open && meta ? (
              <div className="break-words text-xs uppercase tracking-[0.16em] text-white/40">
                {meta}
              </div>
            ) : null}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <CopyButton
            text={copyText}
            tracking={null}
            showContinue={false}
            chrome={chrome?.copy}
          />
          <span className="text-xs text-white/45" aria-hidden="true">
            {open ? collapse : expand}
          </span>
        </div>
      </div>

      {open ? (
        <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
          <FieldBlock label={whyLabel} value={why} emphasize />
          {noticed ? (
            <FieldBlock
              label={noticedLabel ?? "What Athena noticed"}
              value={noticed}
            />
          ) : null}
          {impact ? <FieldBlock label={impactLabel} value={impact} /> : null}
          {effort ? <FieldBlock label={effortLabel} value={effort} /> : null}
          {recommendedAction ? (
            <FieldBlock label={actionLabel} value={recommendedAction} />
          ) : null}
          {affectedPages.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                {pagesLabel}
              </div>
              <ul className="space-y-1.5 text-sm leading-6 text-white/65">
                {affectedPages.map((page) => (
                  <li key={page} className="break-all">
                    {page}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evidence.length > 0 ? (
            <AthenaCollapsibleSection
              title={evidenceLabel}
              defaultOpen={evidenceDefaultOpen}
              showToggleLabel
              toggleLabels={
                chrome?.expand && chrome?.collapse
                  ? { expand: chrome.expand, collapse: chrome.collapse }
                  : null
              }
              className="!rounded-2xl"
              contentClassName="space-y-2"
            >
              <ul className="space-y-1.5 text-sm leading-6 text-white/65">
                {evidence.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </AthenaCollapsibleSection>
          ) : null}
        </div>
      ) : null}

      {/*
        Future execution slot — structure only.
        Contextual actions (Generate article / FAQ / landing page / etc.)
        can mount here without reshaping the card.
      */}
      <div
        className="seo-recommendation-actions mt-4"
        data-actions-ready="false"
        aria-hidden="true"
      />

      {footer}
    </article>
  );
}
