/**
 * Social Planner Ready-detail visual language.
 * Presentation-only. Does not change generation, conversation, Apply, or DTO shape.
 * Isolated from the /social-planner list module.
 */

export const SOCIAL_DETAIL_DEFAULT_OPEN = {
  strategy: false,
  day: false,
  askAthena: false,
} as const;

export const SOCIAL_DETAIL_BACK_LINK =
  "inline-flex items-center gap-1.5 text-sm text-white/45 transition hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_DETAIL_HEADER_WELL =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[linear-gradient(180deg,rgba(56,189,248,0.16),rgba(232,121,189,0.10))] text-cyan-200 shadow-[0_0_16px_rgba(56,189,248,0.18)]";

export const SOCIAL_DETAIL_SNAPSHOT =
  "rounded-[20px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.07),rgba(232,121,189,0.04)_58%,transparent_82%)] px-4 py-3 shadow-[0_0_18px_rgba(56,189,248,0.04)] sm:px-5";

export const SOCIAL_DETAIL_STRATEGY_SURFACE =
  "relative overflow-hidden !border-[rgba(167,139,250,0.32)] hover:!border-[rgba(167,139,250,0.50)] bg-[linear-gradient(180deg,rgba(167,139,250,0.10),rgba(167,139,250,0.03)_38%,transparent_74%)] shadow-[0_0_24px_rgba(167,139,250,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]";

export const SOCIAL_DETAIL_DAY_SURFACE =
  "relative overflow-hidden rounded-[24px] border border-[rgba(56,189,248,0.28)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(232,121,189,0.04)_52%,transparent_78%)] p-4 shadow-[0_0_20px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.62)] sm:p-5";

export const SOCIAL_DETAIL_DAY_ICON =
  "grid size-9 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-cyan-200 shadow-[0_0_14px_rgba(56,189,248,0.16)]";

export const SOCIAL_DETAIL_ASK_SURFACE =
  "relative overflow-hidden !border-[rgba(167,139,250,0.32)] hover:!border-[rgba(167,139,250,0.50)] bg-[linear-gradient(180deg,rgba(167,139,250,0.10),rgba(167,139,250,0.03)_38%,transparent_74%)] shadow-[0_0_24px_rgba(167,139,250,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]";

export const SOCIAL_DETAIL_PRODUCTION_SURFACE =
  "relative overflow-hidden rounded-[20px] border border-[rgba(251,191,36,0.22)] bg-[linear-gradient(180deg,rgba(251,191,36,0.07),rgba(251,191,36,0.02)_42%,transparent_78%)] px-4 py-4 shadow-[0_0_18px_rgba(251,191,36,0.04)] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,191,36,0.52)] sm:px-5";

export const SOCIAL_DETAIL_COPY_SURFACE =
  "rounded-[18px] bg-white/[0.03] px-4 py-4";

export const SOCIAL_DETAIL_STATUS_SURFACE =
  "relative overflow-hidden rounded-[24px] border border-[rgba(167,139,250,0.28)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(167,139,250,0.10),rgba(56,189,248,0.06)_48%,transparent_78%)] p-6 shadow-[0_0_24px_rgba(167,139,250,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.55)] sm:p-8";

export const SOCIAL_DETAIL_FAILED_SURFACE =
  "relative overflow-hidden rounded-[24px] border border-rose-400/28 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(251,113,133,0.10),transparent_62%)] p-6 shadow-[0_0_22px_rgba(251,113,133,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-rose-400/70 sm:p-8";

export const SOCIAL_DETAIL_UNAVAILABLE_SURFACE =
  "relative overflow-hidden rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(251,113,133,0.06),transparent_68%)] p-6 shadow-[0_0_18px_rgba(0,0,0,0.12)] sm:p-8";

export const SOCIAL_DETAIL_ICON_WELL =
  "grid size-10 shrink-0 place-items-center rounded-2xl";

export const SOCIAL_DETAIL_ICON = {
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  cyan: "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  amber:
    "border border-[rgba(251,191,36,0.30)] bg-[rgba(251,191,36,0.10)] text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.14)]",
  rose: "border border-rose-400/30 bg-rose-500/12 text-rose-200 shadow-[0_0_14px_rgba(251,113,133,0.16)]",
} as const;

export const SOCIAL_DETAIL_CHIP_READY =
  "inline-flex items-center rounded-full border border-[var(--athena-success)]/35 bg-[var(--athena-success)]/12 px-3 py-1 text-xs font-semibold text-[var(--athena-success)]";

export const SOCIAL_DETAIL_CHIP_PROGRESS =
  "inline-flex items-center rounded-full border border-[rgba(167,139,250,0.28)] bg-[linear-gradient(180deg,rgba(167,139,250,0.12),rgba(255,102,0,0.08))] px-3 py-1 text-xs font-semibold text-violet-200";

export const SOCIAL_DETAIL_CHIP_FAILED =
  "inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100";

export const SOCIAL_DETAIL_CHIP_META =
  "inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70";

export const SOCIAL_DETAIL_META_CHIP =
  "inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/55";

export const SOCIAL_DETAIL_PLATFORM_CHIP =
  "inline-flex rounded-full border border-[rgba(56,189,248,0.22)] bg-[rgba(56,189,248,0.08)] px-2 py-0.5 text-[11px] font-medium text-cyan-100/85";

export const SOCIAL_DETAIL_DAY_NAV_CHIP =
  "shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-[rgba(56,189,248,0.40)] hover:bg-[rgba(56,189,248,0.10)] hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_DETAIL_UTILITY_ACTION =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_DETAIL_DAY_ACTION =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_DETAIL_EXPAND_ACTION =
  "inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/50 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_DETAIL_FIELD_LABEL =
  "text-[11px] font-medium tracking-wide text-white/42";

export const SOCIAL_DETAIL_FIELD_VALUE =
  "whitespace-pre-wrap break-words rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white/80";

export const SOCIAL_DETAIL_SLIDE_ROW =
  "min-w-0 rounded-xl bg-white/[0.03] px-3 py-3";

const STRATEGY_PREVIEW_MAX_CHARS = 140;

function trimmedOrNull(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function socialPlannerDetailStatusChipClass(status: string): string {
  if (status === "Ready") return SOCIAL_DETAIL_CHIP_READY;
  if (status === "Processing Failed") return SOCIAL_DETAIL_CHIP_FAILED;
  if (status === "Queued" || status === "Processing") {
    return SOCIAL_DETAIL_CHIP_PROGRESS;
  }
  return SOCIAL_DETAIL_CHIP_META;
}

export function shouldShowSocialDetailGenerationMode(
  generationMode?: string | null,
): boolean {
  const mode = String(generationMode ?? "").trim();
  return Boolean(mode) && mode !== "standard";
}

export function presentSocialDetailStrategyPreview(
  value?: string | null,
  maxChars = STRATEGY_PREVIEW_MAX_CHARS,
): string | null {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

export type SocialDetailSnapshot = {
  userGuidance: string | null;
  strategyPreview: string | null;
};

export function presentSocialDetailSnapshot(input: {
  userGuidance?: string | null;
  strategySummary?: string | null;
}): SocialDetailSnapshot {
  return {
    userGuidance: trimmedOrNull(input.userGuidance),
    strategyPreview: presentSocialDetailStrategyPreview(input.strategySummary),
  };
}
