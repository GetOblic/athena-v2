/**
 * Visibility Strategy report detail visual language.
 * Presentation-only. Does not import identity modules or change score math.
 */

import type { SeoTechnicalPriorityAccent } from "@/components/seo/seoTechnicalReportPresentation";

export const SEO_STRATEGY_SURFACE = {
  assessment:
    "relative overflow-hidden rounded-[28px] border border-[rgba(167,139,250,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(167,139,250,0.11),rgba(255,102,0,0.04)_52%,transparent_78%)] p-6 shadow-[0_0_24px_rgba(167,139,250,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.68)]",
  findingsParent:
    "relative !border-white/10 hover:!border-[rgba(167,139,250,0.22)] bg-[linear-gradient(180deg,rgba(167,139,250,0.04),transparent_50%)] shadow-none",
} as const;

export const SEO_STRATEGY_ICON = {
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.12)]",
  orange:
    "border border-[rgba(255,102,0,0.30)] bg-[rgba(255,102,0,0.12)] text-[var(--athena-orange)] shadow-[0_0_14px_rgba(255,102,0,0.12)]",
  cyan: "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.14)]",
  green:
    "border border-[var(--athena-success)]/35 bg-[var(--athena-success)]/12 text-[var(--athena-success)] shadow-[0_0_14px_rgba(0,208,132,0.14)]",
  amber:
    "border border-[rgba(251,191,36,0.30)] bg-[rgba(251,191,36,0.10)] text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.10)]",
  muted: "border border-white/10 bg-white/[0.04] text-white/50",
} as const;

export const SEO_STRATEGY_CATEGORY_SURFACE = {
  violet:
    "relative !border-[rgba(167,139,250,0.26)] hover:!border-[rgba(167,139,250,0.42)] bg-[linear-gradient(180deg,rgba(167,139,250,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.56)]",
  cyan: "relative !border-[rgba(56,189,248,0.26)] hover:!border-[rgba(56,189,248,0.42)] bg-[linear-gradient(180deg,rgba(56,189,248,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.58)]",
  green:
    "relative !border-[rgba(0,208,132,0.24)] hover:!border-[rgba(0,208,132,0.40)] bg-[linear-gradient(180deg,rgba(0,208,132,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(0,208,132,0.56)]",
  muted:
    "relative !border-white/12 hover:!border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_48%)]",
} as const;

export const SEO_STRATEGY_PRIORITY_PILL = {
  high: "border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 text-[var(--athena-orange)]",
  strategic:
    "border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.12)] text-violet-200",
  improvement:
    "border-[var(--athena-success)]/30 bg-[var(--athena-success)]/10 text-[var(--athena-success)]",
} as const;

export const SEO_STRATEGY_PRIORITY_CARD = {
  strategic:
    "relative overflow-hidden rounded-2xl border border-[rgba(167,139,250,0.28)] bg-black/20 bg-[linear-gradient(180deg,rgba(167,139,250,0.08),transparent_54%)] before:pointer-events-none before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.68)]",
} as const;

export const SEO_STRATEGY_PRIORITY_ICON = {
  strategic:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300",
} as const;

export const SEO_STRATEGY_COVERAGE = {
  well: "relative overflow-hidden rounded-2xl border border-[rgba(0,208,132,0.24)] bg-black/20 bg-[linear-gradient(180deg,rgba(0,208,132,0.08),transparent_62%)] px-4 py-3 before:pointer-events-none before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(0,208,132,0.62)]",
  weak: "relative overflow-hidden rounded-2xl border border-[rgba(251,191,36,0.24)] bg-black/20 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),transparent_62%)] px-4 py-3 before:pointer-events-none before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,191,36,0.55)]",
  missing:
    "relative overflow-hidden rounded-2xl border border-[rgba(251,113,133,0.22)] bg-black/20 bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_62%)] px-4 py-3 before:pointer-events-none before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,113,133,0.58)]",
} as const;

export const SEO_STRATEGY_COVERAGE_LABEL = {
  well: "text-[var(--athena-success)]",
  weak: "text-amber-200",
  missing: "text-rose-100",
} as const;

export type SeoStrategyCoverageTone = keyof typeof SEO_STRATEGY_COVERAGE;

export type SeoStrategyPriorityAccent =
  | SeoTechnicalPriorityAccent
  | "strategic";

/** Maps stored P0–P3 labels onto existing severity families. Does not invent priorities. */
export function strategyRoadmapPriorityAccent(
  priority: string,
): SeoStrategyPriorityAccent {
  if (priority === "P0" || priority === "P1") return "high";
  if (priority === "P2") return "strategic";
  return "improvement";
}

export function strategyRoadmapPriorityPill(priority: string): string {
  if (priority === "P0" || priority === "P1") {
    return SEO_STRATEGY_PRIORITY_PILL.high;
  }
  if (priority === "P2") return SEO_STRATEGY_PRIORITY_PILL.strategic;
  return SEO_STRATEGY_PRIORITY_PILL.improvement;
}
