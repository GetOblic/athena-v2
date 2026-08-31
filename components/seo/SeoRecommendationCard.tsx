"use client";

import type { ReactNode } from "react";
import {
  CopyButton,
  type CopyButtonChrome,
} from "@/components/deployment/CopyButton";
import { SeoPriorityBadge } from "@/components/seo/SeoPriorityBadge";
import type {
  SeoFutureActionKind,
  SeoPriorityVisual,
} from "@/services/seo/seoReportPresentation";

export type SeoRecommendationCardChrome = {
  whyLabel?: string;
  evidenceLabel?: string;
  impactLabel?: string;
  copyWhyPrefix?: (why: string) => string;
  copyImpactPrefix?: (impact: string) => string;
  copyEvidencePrefix?: (evidence: string) => string;
  copy?: CopyButtonChrome | null;
};

type SeoRecommendationCardProps = {
  title: string;
  why: string;
  evidence?: string[];
  impact?: string;
  priorityVisual?: SeoPriorityVisual;
  meta?: string;
  /** Reserved for future contextual generation actions — not rendered as CTAs yet. */
  futureActionKinds?: SeoFutureActionKind[];
  footer?: ReactNode;
  chrome?: SeoRecommendationCardChrome | null;
};

function FieldBlock({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  if (!value.trim()) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <p
        className={
          emphasize
            ? "text-sm leading-7 text-white/90"
            : "text-sm leading-7 text-white/70"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function SeoRecommendationCard({
  title,
  why,
  evidence = [],
  impact,
  priorityVisual,
  meta,
  futureActionKinds = [],
  footer,
  chrome,
}: SeoRecommendationCardProps) {
  const whyLabel = chrome?.whyLabel ?? "Why Athena recommends this";
  const evidenceLabel = chrome?.evidenceLabel ?? "Evidence";
  const impactLabel = chrome?.impactLabel ?? "Expected business impact";
  const copyText = [
    title,
    why
      ? chrome?.copyWhyPrefix
        ? chrome.copyWhyPrefix(why)
        : `Why Athena recommends this: ${why}`
      : "",
    impact
      ? chrome?.copyImpactPrefix
        ? chrome.copyImpactPrefix(impact)
        : `Expected business impact: ${impact}`
      : "",
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
        <div className="min-w-0 space-y-3">
          {priorityVisual ? <SeoPriorityBadge visual={priorityVisual} /> : null}
          <h3 className="text-lg font-semibold tracking-tight text-white">
            {title}
          </h3>
          {meta ? (
            <div className="text-xs uppercase tracking-[0.16em] text-white/40">
              {meta}
            </div>
          ) : null}
        </div>
        <CopyButton
          text={copyText}
          tracking={null}
          showContinue={false}
          chrome={chrome?.copy}
        />
      </div>

      <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
        <FieldBlock label={whyLabel} value={why} emphasize />
        {evidence.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              {evidenceLabel}
            </div>
            <ul className="space-y-1.5 text-sm leading-6 text-white/65">
              {evidence.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {impact ? <FieldBlock label={impactLabel} value={impact} /> : null}
      </div>

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
