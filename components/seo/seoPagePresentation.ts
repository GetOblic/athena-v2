/**
 * SEO-specific visual language for Build Visibility.
 * Follows the accepted /identity aesthetic as precedent.
 * Does not import identity presentation modules.
 */

export const SEO_HEADER_CTA_CLASS =
  "inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 sm:w-auto";

export const SEO_OPEN_ANALYSIS_CLASS =
  "inline-flex w-full items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-semibold text-white/85 transition hover:border-white/25 hover:text-white";

export const SEO_TYPE_CARD_SURFACE = {
  strategy:
    "relative overflow-hidden rounded-[28px] border border-[rgba(167,139,250,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(167,139,250,0.08),rgba(255,102,0,0.04)_42%,transparent_72%)] p-6 shadow-[0_0_28px_rgba(167,139,250,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)] sm:p-7",
  technical:
    "relative overflow-hidden rounded-[28px] border border-[rgba(56,189,248,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),transparent_52%)] p-6 shadow-[0_0_28px_rgba(56,189,248,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)] sm:p-7",
} as const;

export const SEO_TYPE_CARD_ICON = {
  strategy:
    "grid size-11 shrink-0 place-items-center rounded-2xl border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  technical:
    "grid size-11 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
} as const;

export const SEO_SCORE_RING = {
  strategy: "rgb(167, 139, 250)",
  technical: "rgb(56, 189, 248)",
  technicalHealthy: "rgb(0, 208, 132)",
} as const;

export const SEO_SCORE_SURFACE = {
  strategy:
    "relative overflow-hidden rounded-[24px] border border-[rgba(167,139,250,0.30)] bg-black/20 bg-[linear-gradient(180deg,rgba(167,139,250,0.10),rgba(255,102,0,0.05)_52%,transparent_82%)] p-4 shadow-[0_0_22px_rgba(167,139,250,0.08)] sm:p-5",
  technical:
    "rounded-[24px] border border-[rgba(56,189,248,0.28)] bg-black/20 p-4 shadow-[0_0_20px_rgba(56,189,248,0.06)] sm:p-5",
} as const;

export const SEO_SCORE_LABEL = {
  strategy: "text-violet-300",
  technical: "text-sky-300",
} as const;

export const SEO_HISTORY_ROW_CLASS =
  "flex flex-col gap-4 rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5 shadow-[0_0_20px_rgba(255,255,255,0.02)] transition hover:border-white/18 md:flex-row md:items-center md:justify-between";

export const SEO_CHOICE_CARD = {
  strategy:
    "flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(167,139,250,0.28)] bg-[linear-gradient(180deg,rgba(167,139,250,0.08),transparent_70%)] px-4 py-4",
  strategySelected:
    "flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(167,139,250,0.55)] bg-[linear-gradient(180deg,rgba(167,139,250,0.14),transparent_70%)] px-4 py-4 shadow-[0_0_18px_rgba(167,139,250,0.08)]",
  technical:
    "flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(56,189,248,0.28)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),transparent_70%)] px-4 py-4",
  technicalSelected:
    "flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(56,189,248,0.55)] bg-[linear-gradient(180deg,rgba(56,189,248,0.14),transparent_70%)] px-4 py-4 shadow-[0_0_18px_rgba(56,189,248,0.08)]",
  technicalDisabled:
    "flex min-w-0 cursor-not-allowed items-start gap-3 rounded-2xl border border-white/5 bg-black/10 px-4 py-4 opacity-70",
} as const;
