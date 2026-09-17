import type { UpgradeAccent, UpgradeCtaTone } from "@/lib/upgrade/upgradePresentation";

export const UPGRADE_FOCUS_RING_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const UPGRADE_CARD_BASE_CLASS =
  "relative rounded-[24px] border bg-[var(--athena-card)] p-6 motion-safe:transition-colors";

export const UPGRADE_HINT_BASE_CLASS = "relative";

export const UPGRADE_SIDEBAR_BASE_CLASS =
  "relative rounded-2xl border border-white/10 bg-white/[0.02] p-4";

export const UPGRADE_ACCENT_SURFACE: Record<UpgradeAccent, string> = {
  identity:
    "border-[var(--athena-success)]/35 bg-[linear-gradient(180deg,rgba(0,208,132,0.08),transparent_48%)] shadow-[0_0_24px_rgba(0,208,132,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/75",
  visibility:
    "border-[rgba(167,139,250,0.30)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_48%)] shadow-[0_0_22px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  audience:
    "border-[rgba(167,139,250,0.30)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_48%)] shadow-[0_0_22px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  advertising:
    "border-[rgba(245,158,11,0.28)] bg-[linear-gradient(180deg,rgba(245,158,11,0.06),transparent_48%)] shadow-[0_0_22px_rgba(245,158,11,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(245,158,11,0.58)]",
  social:
    "border-[rgba(34,211,238,0.28)] bg-[linear-gradient(180deg,rgba(34,211,238,0.06),transparent_48%)] shadow-[0_0_22px_rgba(34,211,238,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(34,211,238,0.58)]",
  convert:
    "border-[rgba(56,189,248,0.30)] bg-[linear-gradient(180deg,rgba(56,189,248,0.06),transparent_48%)] shadow-[0_0_22px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.62)]",
  help:
    "border-[rgba(255,102,0,0.28)] bg-[linear-gradient(180deg,rgba(255,102,0,0.06),transparent_48%)] shadow-[0_0_22px_rgba(255,102,0,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.62)]",
  chrome:
    "border-white/10 bg-white/[0.02] before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[2px] before:rounded-r-full before:bg-white/20",
};

export const UPGRADE_ACCENT_ICON: Record<UpgradeAccent, string> = {
  identity:
    "border border-[var(--athena-success)]/40 bg-[var(--athena-success)]/15 text-[var(--athena-success)]",
  visibility:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300",
  audience:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300",
  advertising:
    "border border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.12)] text-amber-200",
  social:
    "border border-[rgba(34,211,238,0.30)] bg-[rgba(34,211,238,0.12)] text-cyan-200",
  convert:
    "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300",
  help:
    "border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)]",
  chrome: "border border-white/15 bg-white/5 text-white/55",
};

export const UPGRADE_ACCENT_PIP: Record<UpgradeAccent, string> = {
  identity: "bg-[var(--athena-success)]/80",
  visibility: "bg-[rgba(167,139,250,0.75)]",
  audience: "bg-[rgba(167,139,250,0.75)]",
  advertising: "bg-[rgba(245,158,11,0.75)]",
  social: "bg-[rgba(34,211,238,0.75)]",
  convert: "bg-[rgba(56,189,248,0.75)]",
  help: "bg-[rgba(255,102,0,0.75)]",
  chrome: "bg-white/35",
};

export const UPGRADE_CTA_TONE_CLASS: Record<UpgradeCtaTone, string> = {
  quiet:
    "inline-flex items-center text-sm font-semibold text-white/70 motion-safe:transition-colors hover:text-white",
  medium:
    "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/85 motion-safe:transition-colors hover:border-white/25 hover:bg-white/[0.05]",
  primary:
    "inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-white/[0.14]",
};

/** Reserved continuation label while destination/action is unset. Not a control. */
export const UPGRADE_CTA_STATIC_CLASS: Record<UpgradeCtaTone, string> = {
  quiet: "text-sm font-semibold leading-5 text-white/70",
  medium:
    "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/85",
  primary:
    "inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white",
};
