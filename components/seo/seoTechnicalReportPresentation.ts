/**
 * Technical SEO report detail visual language.
 * Presentation-only. Does not import identity modules or change score math.
 */

export const SEO_TECHNICAL_SURFACE = {
  assessment:
    "relative overflow-hidden rounded-[28px] border border-[rgba(56,189,248,0.28)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.10),transparent_56%)] p-6 shadow-[0_0_24px_rgba(56,189,248,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  evidence:
    "relative overflow-hidden rounded-[28px] border border-[rgba(56,189,248,0.26)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),transparent_52%)] p-6 shadow-[0_0_22px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.58)]",
  diagnosticsParent:
    "relative !border-white/10 hover:!border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_50%)] shadow-none",
  implementation:
    "relative !border-[rgba(0,208,132,0.28)] hover:!border-[rgba(0,208,132,0.46)] bg-[linear-gradient(180deg,rgba(0,208,132,0.07),transparent_48%)] shadow-[0_0_22px_rgba(0,208,132,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(0,208,132,0.62)]",
  pages:
    "relative !border-[rgba(56,189,248,0.18)] hover:!border-[rgba(56,189,248,0.32)] bg-[linear-gradient(180deg,rgba(56,189,248,0.04),transparent_48%)] shadow-none before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.42)]",
  disclaimer:
    "flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3",
} as const;

export const SEO_TECHNICAL_ICON = {
  cyan: "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.14)]",
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.12)]",
  amber:
    "border border-[rgba(251,191,36,0.30)] bg-[rgba(251,191,36,0.10)] text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.10)]",
  green:
    "border border-[var(--athena-success)]/35 bg-[var(--athena-success)]/12 text-[var(--athena-success)] shadow-[0_0_14px_rgba(0,208,132,0.14)]",
  orange:
    "border border-[rgba(255,102,0,0.30)] bg-[rgba(255,102,0,0.12)] text-[var(--athena-orange)] shadow-[0_0_14px_rgba(255,102,0,0.12)]",
  muted:
    "border border-white/10 bg-white/[0.04] text-white/50",
} as const;

export const SEO_TECHNICAL_CATEGORY_SURFACE = {
  cyan: "relative !border-[rgba(56,189,248,0.26)] hover:!border-[rgba(56,189,248,0.42)] bg-[linear-gradient(180deg,rgba(56,189,248,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.58)]",
  violet:
    "relative !border-[rgba(167,139,250,0.26)] hover:!border-[rgba(167,139,250,0.42)] bg-[linear-gradient(180deg,rgba(167,139,250,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.56)]",
  amber:
    "relative !border-[rgba(251,191,36,0.24)] hover:!border-[rgba(251,191,36,0.40)] bg-[linear-gradient(180deg,rgba(251,191,36,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,191,36,0.52)]",
  green:
    "relative !border-[rgba(0,208,132,0.24)] hover:!border-[rgba(0,208,132,0.40)] bg-[linear-gradient(180deg,rgba(0,208,132,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(0,208,132,0.56)]",
  orange:
    "relative !border-[rgba(255,102,0,0.26)] hover:!border-[rgba(255,102,0,0.42)] bg-[linear-gradient(180deg,rgba(255,102,0,0.05),transparent_48%)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.58)]",
} as const;

export const SEO_TECHNICAL_PRIORITY_PILL = {
  critical: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  high: "border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 text-[var(--athena-orange)]",
  improvement:
    "border-[var(--athena-success)]/30 bg-[var(--athena-success)]/10 text-[var(--athena-success)]",
} as const;

export const SEO_TECHNICAL_PRIORITY_CARD = {
  critical:
    "relative overflow-hidden rounded-2xl border border-rose-400/25 bg-black/20 bg-[linear-gradient(180deg,rgba(251,113,133,0.07),transparent_54%)] before:pointer-events-none before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-rose-400/70",
  high: "relative overflow-hidden rounded-2xl border border-[rgba(255,102,0,0.28)] bg-black/20 bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_54%)] before:pointer-events-none before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.7)]",
  improvement:
    "relative overflow-hidden rounded-2xl border border-[rgba(0,208,132,0.26)] bg-black/20 bg-[linear-gradient(180deg,rgba(0,208,132,0.07),transparent_54%)] before:pointer-events-none before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(0,208,132,0.68)]",
} as const;

export const SEO_TECHNICAL_PRIORITY_ICON = {
  critical: "border border-rose-400/30 bg-rose-500/10 text-rose-200",
  high: "border border-[rgba(255,102,0,0.30)] bg-[rgba(255,102,0,0.12)] text-[var(--athena-orange)]",
  improvement:
    "border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/12 text-[var(--athena-success)]",
} as const;

export type SeoTechnicalPriorityAccent = keyof typeof SEO_TECHNICAL_PRIORITY_PILL;

/** Visual meter tint only. Does not change coverage math or SEO grades. */
export function technicalCoverageMeterAccent(
  percent: number | null,
): "healthy" | "technical" {
  if (percent != null && Number.isFinite(percent) && percent >= 90) {
    return "healthy";
  }
  return "technical";
}
