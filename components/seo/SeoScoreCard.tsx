import type { ReactNode } from "react";
import {
  seoCompletenessBand,
  type SeoCompletenessBand,
} from "@/lib/seo/seoScorePresentation";
import {
  SEO_SCORE_LABEL,
  SEO_SCORE_RING,
  SEO_SCORE_SURFACE,
} from "@/components/seo/seoPagePresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type SeoScoreFamily = "strategy" | "technical";

type SeoScoreCardProps = {
  family: SeoScoreFamily;
  score: number | null;
  label: string;
  help: string;
  unavailableLabel: string;
  unavailableHelp: string;
  bandLabel?: string;
  context?: string;
  icon?: ReactNode;
  messages: TenantMessages["seo"]["visibility"];
};

function ringColor(family: SeoScoreFamily, score: number | null): string {
  if (family === "strategy") return SEO_SCORE_RING.strategy;
  if (score != null && score >= 70) return SEO_SCORE_RING.technicalHealthy;
  return SEO_SCORE_RING.technical;
}

function defaultBandLabel(
  family: SeoScoreFamily,
  score: number,
  messages: TenantMessages["seo"]["visibility"],
): string {
  const band = seoCompletenessBand(score);
  if (family === "strategy") {
    if (band === "needsAttention") return messages.contentCoverageBandNeedsAttention;
    if (band === "developing") return messages.contentCoverageBandDeveloping;
    if (band === "strong") return messages.contentCoverageBandStrong;
    return messages.contentCoverageBandExcellent;
  }
  if (band === "needsAttention") return messages.technicalBandNeedsAttention;
  if (band === "developing") return messages.technicalBandDeveloping;
  if (band === "strong") return messages.technicalBandStrong;
  return messages.technicalBandExcellent;
}

export function SeoScoreCard({
  family,
  score,
  label,
  help,
  unavailableLabel,
  unavailableHelp,
  bandLabel,
  context,
  icon,
  messages,
}: SeoScoreCardProps) {
  const available = score != null;
  const clamped = available ? Math.min(100, Math.max(0, Math.round(score))) : 0;
  const fill = available ? clamped : 0;
  const color = ringColor(family, available ? clamped : null);
  const bandKey: SeoCompletenessBand | null = available
    ? seoCompletenessBand(clamped)
    : null;
  const shortBand = bandKey ? messages[bandKey] : null;
  const band =
    available
      ? bandLabel ?? defaultBandLabel(family, clamped, messages)
      : unavailableHelp;

  return (
    <div className={SEO_SCORE_SURFACE[family]}>
      <div className="flex items-center gap-4">
        <div
          className="relative grid size-[4.5rem] shrink-0 place-items-center"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${color} ${fill}%, rgba(255,255,255,0.08) 0)`,
            }}
          />
          <div className="absolute inset-[6px] rounded-full bg-[var(--athena-card)]" />
        </div>

        <div className="min-w-0">
          <p
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] ${SEO_SCORE_LABEL[family]}`}
          >
            {icon ? (
              <span className="shrink-0 [&_svg]:size-3.5" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <span className="min-w-0">{label}</span>
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-white">
            {available ? `${clamped}%` : "—"}
          </p>
          {!available ? (
            <p className="mt-1 text-sm text-white/45">{unavailableLabel}</p>
          ) : (
            <p className="mt-1 text-sm font-medium text-white/70">{shortBand}</p>
          )}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-white/60">{help}</p>
      <p className="mt-1 text-sm leading-6 text-white/40">{band}</p>
      {context ? (
        <p className="mt-2 text-sm leading-6 text-white/50">{context}</p>
      ) : null}
    </div>
  );
}
