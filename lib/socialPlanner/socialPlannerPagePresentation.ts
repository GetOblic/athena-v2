/**
 * Social Planner library (/social-planner) visual language.
 * Presentation-only. Does not change create, search, pagination, or generation.
 */

export const SOCIAL_PAGE_HEADER_ICON =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[linear-gradient(180deg,rgba(56,189,248,0.16),rgba(232,121,189,0.10))] text-cyan-200 shadow-[0_0_16px_rgba(56,189,248,0.18)]";

export const SOCIAL_COMPOSER_SURFACE =
  "relative overflow-hidden rounded-[28px] border border-[rgba(255,102,0,0.28)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,102,0,0.10),rgba(56,189,248,0.05)_48%,transparent_78%)] p-6 shadow-[0_0_24px_rgba(255,102,0,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.68)] sm:p-8";

export const SOCIAL_COMPOSER_ICON =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.18)]";

export const SOCIAL_FIELD_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50";

export const SOCIAL_FIELD_HELP_CLASS = "text-xs leading-5 text-white/40";

export const SOCIAL_FIELD_CLASS =
  "w-full min-w-0 rounded-2xl border border-white/[0.10] bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-[rgba(56,189,248,0.40)] focus:ring-2 focus:ring-[rgba(56,189,248,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_TEXTAREA_CLASS = `${SOCIAL_FIELD_CLASS} min-h-[140px] resize-y leading-6`;

export const SOCIAL_PRIMARY_CLASS =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export const SOCIAL_SEARCH_SURFACE =
  "rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.06),rgba(232,121,189,0.04)_58%,transparent_78%)] p-3 shadow-[0_0_22px_rgba(56,189,248,0.04)] sm:p-4";

export const SOCIAL_SEARCH_FIELD_CLASS =
  "w-full rounded-2xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-[rgba(56,189,248,0.40)] focus:ring-2 focus:ring-[rgba(56,189,248,0.14)]";

export const SOCIAL_WEEK_CARD_CLASS =
  "relative flex flex-col gap-3 overflow-hidden rounded-[24px] border border-[rgba(56,189,248,0.22)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(232,121,189,0.04)_52%,transparent_78%)] p-4 shadow-[0_0_20px_rgba(56,189,248,0.04)] transition hover:border-[rgba(56,189,248,0.38)] sm:p-5";

export const SOCIAL_WEEK_ICON_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-cyan-200 shadow-[0_0_14px_rgba(56,189,248,0.16)]";

export const SOCIAL_OPEN_ACTION_CLASS =
  "inline-flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const SOCIAL_HISTORY_HEADING_CLASS =
  "text-lg font-semibold tracking-tight text-white/80";

export const SOCIAL_EMPTY_SEARCH_CLASS =
  "rounded-[24px] border border-dashed border-[rgba(56,189,248,0.22)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.05),transparent_70%)] px-6 py-10 text-center";

export const SOCIAL_EMPTY_SEARCH_ICON =
  "mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.10)] text-cyan-200 shadow-[0_0_14px_rgba(56,189,248,0.12)]";

export const SOCIAL_PAGINATION_CLASS =
  "flex items-center justify-between text-xs text-white/40";

export const SOCIAL_PAGINATION_BUTTON_CLASS =
  "rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-white/20 hover:text-white/80 disabled:opacity-30";

export const SOCIAL_MODE_BADGE_CLASS =
  "inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/40";

export const SOCIAL_MODE_THINK_CLASS =
  "inline-flex rounded-full border border-[var(--athena-success)]/25 bg-[var(--athena-success)]/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--athena-success)]/80";

export function socialPlannerHistoryStatusClass(status: string): string {
  if (status === "Ready") {
    return "inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200";
  }
  if (status === "Processing Failed") {
    return "inline-flex rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-100";
  }
  return "inline-flex rounded-full border border-[rgba(167,139,250,0.28)] bg-[linear-gradient(180deg,rgba(167,139,250,0.12),rgba(255,102,0,0.08))] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200";
}

export function socialPlannerGenerationModeBadgeClass(
  generationMode: string,
): string {
  if (generationMode === "think_differently") {
    return SOCIAL_MODE_THINK_CLASS;
  }
  return SOCIAL_MODE_BADGE_CLASS;
}
