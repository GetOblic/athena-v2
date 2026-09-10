"use client";

import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  FileText,
  Lightbulb,
  Target,
} from "lucide-react";
import {
  CopyButton,
  type CopyButtonChrome,
} from "@/components/deployment/CopyButton";
import { SeoPriorityBadge } from "@/components/seo/SeoPriorityBadge";
import {
  SEO_STRATEGY_PRIORITY_CARD,
  SEO_STRATEGY_PRIORITY_ICON,
  type SeoStrategyPriorityAccent,
} from "@/components/seo/seoStrategyReportPresentation";
import {
  SEO_TECHNICAL_PRIORITY_CARD,
  SEO_TECHNICAL_PRIORITY_ICON,
} from "@/components/seo/seoTechnicalReportPresentation";
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
  priorityAccent?: SeoStrategyPriorityAccent;
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
  copyVariant?: "default" | "utility";
};

function FieldBlock({
  label,
  value,
  emphasize = false,
  breakAll = false,
  icon,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  breakAll?: boolean;
  icon?: ReactNode;
}) {
  if (!value.trim()) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 [&_svg]:size-3.5"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {label}
        </div>
      </div>
      <p
        className={`${
          emphasize
            ? "text-sm leading-7 text-white/90"
            : "text-sm leading-7 text-white/70"
        } ${breakAll ? "break-all" : "break-words"} ${icon ? "sm:pl-9" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function PriorityMark({
  accent,
}: {
  accent?: SeoStrategyPriorityAccent;
}) {
  if (accent === "critical") {
    return <AlertTriangle size={16} />;
  }
  if (accent === "high") {
    return <AlertCircle size={16} />;
  }
  if (accent === "improvement") {
    return <CheckCircle size={16} />;
  }
  if (accent === "strategic") {
    return <Target size={16} />;
  }
  return null;
}

function priorityCardClass(accent?: SeoStrategyPriorityAccent): string {
  if (!accent) {
    return "relative overflow-hidden rounded-2xl border border-white/10 bg-black/20";
  }
  if (accent === "strategic") return SEO_STRATEGY_PRIORITY_CARD.strategic;
  return SEO_TECHNICAL_PRIORITY_CARD[accent];
}

function priorityIconClass(accent?: SeoStrategyPriorityAccent): string {
  if (accent === "strategic") return SEO_STRATEGY_PRIORITY_ICON.strategic;
  if (accent) return SEO_TECHNICAL_PRIORITY_ICON[accent];
  return "border border-white/10 bg-white/[0.04] text-white/55";
}

export function SeoRecommendationCard({
  title,
  why = "",
  evidence = [],
  impact,
  priorityVisual,
  priorityLabel,
  priorityClassName,
  priorityAccent,
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
  copyVariant = "default",
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
  const collapsedSummary = [why, noticed, effort]
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
  const cardClassName = priorityCardClass(priorityAccent);
  const resolvedPriorityIconClass = priorityIconClass(priorityAccent);

  return (
    <article
      className={cardClassName}
      data-future-action-kinds={futureActionKinds.join(",")}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
          aria-expanded={open}
        >
          {priorityAccent ? (
            <span
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${resolvedPriorityIconClass}`}
              aria-hidden="true"
            >
              <PriorityMark accent={priorityAccent} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2.5">
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
            {!open && collapsedSummary ? (
              <p className="line-clamp-2 break-words text-sm leading-6 text-white/50">
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
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-4 sm:px-4"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <CopyButton
            text={copyText}
            tracking={null}
            showContinue={false}
            chrome={chrome?.copy}
            variant={copyVariant}
          />
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex min-h-10 min-w-10 items-center justify-center text-white/45 transition-colors hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            aria-expanded={open}
            aria-label={open ? collapse : expand}
          >
            <ChevronDown
              className={`size-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-5 border-t border-white/10 px-5 pb-5 pt-4">
          <FieldBlock
            label={whyLabel}
            value={why}
            emphasize
            icon={<Lightbulb />}
          />
          {noticed ? (
            <FieldBlock
              label={noticedLabel ?? "What Athena noticed"}
              value={noticed}
            />
          ) : null}
          {impact ? <FieldBlock label={impactLabel} value={impact} /> : null}
          {effort ? <FieldBlock label={effortLabel} value={effort} /> : null}
          {recommendedAction ? (
            <FieldBlock
              label={actionLabel}
              value={recommendedAction}
              icon={<CheckCircle />}
            />
          ) : null}
          {affectedPages.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55"
                  aria-hidden="true"
                >
                  <FileText size={14} />
                </span>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {pagesLabel}
                </div>
              </div>
              <ul className="space-y-1.5 text-sm leading-6 text-white/65 sm:pl-9">
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
