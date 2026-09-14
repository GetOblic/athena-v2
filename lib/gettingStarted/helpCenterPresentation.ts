/**
 * Help Center presentation tokens.
 * Mirrors accepted Athena V2 Identity / Home / Audience / Prospect grammar
 * without importing feature-owned internals.
 */

export const HELP_PAGE_STACK_CLASS = "space-y-6";

export const HELP_HERO_CLASS = "mb-8 max-w-4xl";

export const HELP_EYEBROW_CLASS =
  "text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]";

export const HELP_TITLE_CLASS =
  "mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl";

export const HELP_TAGLINE_CLASS = "mt-3 text-xl leading-8 text-white/70";

export const HELP_INTRO_CLASS = "mt-6 text-base leading-7 text-white/50";

export const HELP_SEARCH_WRAP_CLASS =
  "mt-8 rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_62%)] p-3 shadow-[0_0_22px_rgba(255,255,255,0.02)] sm:p-4";

export const HELP_SEARCH_FIELD_CLASS =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/25";

export const HELP_NAV_CLASS =
  "rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_70%)] p-3 shadow-[0_0_18px_rgba(255,255,255,0.02)] lg:sticky lg:top-6";

export const HELP_NAV_LINK_CLASS =
  "block rounded-2xl px-3 py-2 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white";

export const HELP_CARD_CLASS =
  "relative overflow-hidden rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5 shadow-[0_0_22px_rgba(0,0,0,0.18)] sm:p-6";

export const HELP_NESTED_CARD_CLASS =
  "rounded-2xl border border-white/10 bg-black/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_70%)] p-4";

export const HELP_EMPTY_STATE_CLASS =
  "rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-8 text-center";

export const HELP_PRIMARY_CTA_CLASS =
  "inline-flex h-11 items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90";

export const HELP_SECONDARY_CTA_CLASS =
  "inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.03] px-5 text-sm font-semibold text-white/85 transition hover:border-white/25 hover:text-white";

export const HELP_CLEAR_SEARCH_CLASS =
  "inline-flex h-10 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.03] px-4 text-sm font-medium text-white/75 transition hover:border-white/25 hover:text-white";

export const HELP_ASK_CTA_CLASS =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export const HELP_ASK_CTA_HINT_CLASS = "text-sm leading-6 text-white/50";

export const HELP_ASK_DESTINATION_CLASS =
  "relative scroll-mt-24 overflow-hidden rounded-[28px] border border-[rgba(0,208,132,0.55)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(0,208,132,0.16),rgba(0,208,132,0.04)_46%,transparent_78%)] p-3 shadow-[0_0_32px_rgba(0,208,132,0.14)] before:pointer-events-none before:absolute before:inset-y-6 before:left-0 before:w-[4px] before:rounded-r-full before:bg-[var(--athena-success)] sm:p-4";

export const HELP_ASK_DESTINATION_HEADER_CLASS =
  "relative mb-3 flex items-start gap-3 px-1 pt-1 sm:mb-4 sm:px-2";

export const HELP_ASK_INNER_CLASS =
  "relative rounded-[22px] border border-[rgba(0,208,132,0.28)] bg-black/30 bg-[linear-gradient(180deg,rgba(0,208,132,0.07),transparent_72%)] p-1 shadow-[0_0_18px_rgba(0,208,132,0.08)] sm:p-2";

export const HELP_STEP_LIST_CLASS = "mt-4 space-y-3";

export const HELP_STEP_ITEM_CLASS =
  "flex gap-3 text-sm leading-6 text-white/65";

export const HELP_BODY_CLASS = "text-sm leading-7 text-white/55";

export const HELP_META_CLASS = "mt-3 text-sm leading-6 text-white/45";

export type HelpAccent = "orange" | "sky" | "violet" | "cyan" | "green" | "muted";

export const HELP_SURFACE: Record<HelpAccent, string> = {
  orange:
    "relative overflow-hidden rounded-[24px] border border-[rgba(255,102,0,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_52%)] shadow-[0_0_24px_rgba(255,102,0,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.68)]",
  sky: "relative overflow-hidden rounded-[24px] border border-[rgba(56,189,248,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.07),transparent_52%)] shadow-[0_0_24px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  violet:
    "relative overflow-hidden rounded-[24px] border border-[rgba(167,139,250,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),transparent_52%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  cyan: "relative overflow-hidden rounded-[24px] border border-[rgba(34,211,238,0.30)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(34,211,238,0.07),transparent_52%)] shadow-[0_0_24px_rgba(34,211,238,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(34,211,238,0.65)]",
  green:
    "relative overflow-hidden rounded-[24px] border border-[var(--athena-success)]/35 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(0,208,132,0.08),transparent_52%)] shadow-[0_0_24px_rgba(0,208,132,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/75",
  muted:
    "relative overflow-hidden rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_58%)] shadow-[0_0_18px_rgba(255,255,255,0.02)]",
};

export const HELP_ICON_WELL: Record<HelpAccent, string> = {
  orange:
    "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.18)]",
  sky: "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  violet:
    "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  cyan: "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(34,211,238,0.32)] bg-[rgba(34,211,238,0.13)] text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.18)]",
  green:
    "grid size-10 shrink-0 place-items-center rounded-2xl border border-[var(--athena-success)]/40 bg-[var(--athena-success)]/15 text-[var(--athena-success)] shadow-[0_0_16px_rgba(0,208,132,0.18)]",
  muted:
    "grid size-10 shrink-0 place-items-center rounded-2xl border border-white/12 bg-white/[0.05] text-white/70 shadow-[0_0_12px_rgba(255,255,255,0.04)]",
};

export const HELP_COLLAPSIBLE_TONE = "intelligence" as const;
