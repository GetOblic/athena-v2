/**
 * Super Admin presentation tokens.
 * Visual language only — no tenant Identity modules, no privileged services.
 */

export type SuperAdminAccent =
  | "orange"
  | "blue"
  | "violet"
  | "green"
  | "warm"
  | "magenta";

export const SUPER_ADMIN_SHELL_CLASS =
  "min-h-screen bg-[var(--athena-bg)] px-5 py-8 text-white sm:px-6 sm:py-10 lg:px-8 xl:px-10";

export const SUPER_ADMIN_CANVAS_CLASS = "mx-auto max-w-[88rem]";

export const SUPER_ADMIN_CARD_SURFACE: Record<SuperAdminAccent, string> = {
  orange:
    "relative !border-[rgba(255,102,0,0.34)] hover:!border-[rgba(255,102,0,0.52)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_46%)] shadow-[0_0_28px_rgba(255,102,0,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.7)]",
  blue:
    "relative !border-[rgba(56,189,248,0.30)] hover:!border-[rgba(56,189,248,0.50)] bg-[linear-gradient(180deg,rgba(56,189,248,0.06),transparent_46%)] shadow-[0_0_24px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  violet:
    "relative !border-[rgba(167,139,250,0.30)] hover:!border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_46%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  green:
    "relative !border-[var(--athena-success)]/35 hover:!border-[var(--athena-success)]/55 bg-[linear-gradient(180deg,rgba(0,208,132,0.09),rgba(19,19,26,0.15)_52%)] shadow-[0_0_30px_rgba(0,208,132,0.08)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/80",
  warm:
    "relative !border-[rgba(255,160,80,0.28)] hover:!border-[rgba(255,160,80,0.46)] bg-[linear-gradient(180deg,rgba(255,160,80,0.05),transparent_46%)] shadow-[0_0_22px_rgba(255,160,80,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,160,80,0.58)]",
  magenta:
    "relative !border-[rgba(232,121,189,0.28)] hover:!border-[rgba(232,121,189,0.46)] bg-[linear-gradient(180deg,rgba(232,121,189,0.06),transparent_46%)] shadow-[0_0_24px_rgba(232,121,189,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(232,121,189,0.6)]",
};

export const SUPER_ADMIN_ICON_WELL: Record<SuperAdminAccent, string> = {
  orange:
    "border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.22)]",
  blue:
    "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  green:
    "border border-[var(--athena-success)]/40 bg-[var(--athena-success)]/15 text-[var(--athena-success)] shadow-[0_0_18px_rgba(0,208,132,0.22)]",
  warm:
    "border border-[rgba(255,160,80,0.30)] bg-[rgba(255,160,80,0.12)] text-orange-200 shadow-[0_0_14px_rgba(255,160,80,0.16)]",
  magenta:
    "border border-[rgba(232,121,189,0.32)] bg-[rgba(232,121,189,0.12)] text-pink-300 shadow-[0_0_16px_rgba(232,121,189,0.16)]",
};

export const SUPER_ADMIN_PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:opacity-60";

export const SUPER_ADMIN_SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60";

export const SUPER_ADMIN_REACTIVATE_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[var(--athena-orange)]/40 px-4 py-2 text-xs font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/10 disabled:opacity-60";

export const SUPER_ADMIN_INPUT_CLASS =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-[var(--athena-orange)] focus:shadow-[0_0_0_3px_rgba(255,102,0,0.12)] disabled:opacity-50";

export const SUPER_ADMIN_TEXTAREA_CLASS =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm leading-6 text-white outline-none placeholder:text-white/25 transition focus:border-[var(--athena-orange)] focus:shadow-[0_0_0_3px_rgba(255,102,0,0.12)]";

export const SUPER_ADMIN_PANEL_CLASS =
  "rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-[0_0_28px_rgba(255,255,255,0.02)]";

export const SUPER_ADMIN_NESTED_CARD_CLASS =
  "rounded-2xl border border-white/10 bg-black/20 px-4 py-4";

export const SUPER_ADMIN_SUCCESS_NOTICE_CLASS =
  "rounded-2xl border border-[var(--athena-success)]/35 bg-[var(--athena-success)]/10 px-5 py-4 text-sm text-emerald-100";

export const SUPER_ADMIN_ERROR_NOTICE_CLASS =
  "rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100";

export const SUPER_ADMIN_STATUS_BADGE_ACTIVE_CLASS =
  "inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-200";

export const SUPER_ADMIN_STATUS_BADGE_DEACTIVATED_CLASS =
  "inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-200";

export const SUPER_ADMIN_OWN_COMPANY_BADGE_CLASS =
  "inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-sky-200";

export const SUPER_ADMIN_CONFIGURED_BADGE_CLASS =
  "inline-flex rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-200";

export const SUPER_ADMIN_UNCONFIGURED_BADGE_CLASS =
  "inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-200";

export const SUPER_ADMIN_NAV_ACTIVE_CLASS =
  "inline-flex items-center gap-3 rounded-full border border-[rgba(255,102,0,0.45)] bg-[rgba(255,102,0,0.12)] px-3 py-2 text-sm font-medium text-white shadow-[0_0_18px_rgba(255,102,0,0.12)]";

export const SUPER_ADMIN_NAV_IDLE_CLASS =
  "inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white";

export const SUPER_ADMIN_TILE_CLASS =
  "w-full rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-5 text-left shadow-[0_0_22px_rgba(255,255,255,0.02)] transition hover:border-[rgba(255,102,0,0.36)] hover:bg-white/[0.03]";
