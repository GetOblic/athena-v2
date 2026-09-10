/**
 * Presentation-only Persona library surfaces.
 * No scoring, readiness, or sort business logic.
 */

import type { ConfidenceLabel } from "@/lib/confidenceDisplay";
import type { PersonaDisplayReadiness } from "@/services/personas/personaDisplay";

export const PERSONA_HEADER_CREATE_CLASS =
  "inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 sm:w-auto";

export const PERSONA_TOOLBAR_SURFACE_CLASS =
  "grid gap-3 rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_62%)] p-3 shadow-[0_0_22px_rgba(255,255,255,0.02)] sm:grid-cols-3 sm:p-4";

export const PERSONA_TOOLBAR_FIELD_CLASS =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none transition focus:border-white/25";

export const PERSONA_CARD_SURFACE_CLASS =
  "relative min-w-0 overflow-hidden rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),transparent_48%)] p-4 shadow-[0_0_22px_rgba(167,139,250,0.04)] transition hover:border-[rgba(167,139,250,0.36)] hover:bg-white/[0.03] sm:p-5";

export const PERSONA_CARD_ICON_WELL_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.16)]";

export const PERSONA_SUMMARY_STRIP_CLASS =
  "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/50";

export const PERSONA_SUMMARY_ITEM_CLASS =
  "inline-flex items-center gap-1.5";

export const PERSONA_CONFIDENCE_RING_PX = 44;
export const PERSONA_CONFIDENCE_DETAIL_RING_PX = 72;

export type PersonaDetailAccent =
  | "violet"
  | "green"
  | "amber"
  | "rose"
  | "cyan"
  | "orange"
  | "blue"
  | "muted";

export const PERSONA_DETAIL_SURFACE: Record<PersonaDetailAccent, string> = {
  violet:
    "relative !border-[rgba(167,139,250,0.30)] hover:!border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),transparent_48%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  green:
    "relative !border-[var(--athena-success)]/35 hover:!border-[var(--athena-success)]/55 bg-[linear-gradient(180deg,rgba(0,208,132,0.08),transparent_48%)] shadow-[0_0_24px_rgba(0,208,132,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/75",
  amber:
    "relative !border-[rgba(196,146,92,0.34)] hover:!border-[rgba(196,146,92,0.50)] bg-[linear-gradient(180deg,rgba(196,146,92,0.08),transparent_48%)] shadow-[0_0_22px_rgba(196,146,92,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(196,146,92,0.72)]",
  rose:
    "relative !border-[rgba(251,113,133,0.30)] hover:!border-[rgba(251,113,133,0.48)] bg-[linear-gradient(180deg,rgba(251,113,133,0.07),transparent_48%)] shadow-[0_0_22px_rgba(251,113,133,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,113,133,0.62)]",
  cyan:
    "relative !border-[rgba(56,189,248,0.30)] hover:!border-[rgba(56,189,248,0.48)] bg-[linear-gradient(180deg,rgba(56,189,248,0.07),transparent_48%)] shadow-[0_0_24px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  orange:
    "relative !border-[rgba(255,102,0,0.30)] hover:!border-[rgba(255,102,0,0.48)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),rgba(167,139,250,0.04)_42%,transparent_72%)] shadow-[0_0_24px_rgba(255,102,0,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.68)]",
  blue:
    "relative !border-[rgba(96,165,250,0.30)] hover:!border-[rgba(96,165,250,0.48)] bg-[linear-gradient(180deg,rgba(96,165,250,0.07),transparent_48%)] shadow-[0_0_22px_rgba(96,165,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(96,165,250,0.62)]",
  muted:
    "relative !border-[rgba(167,139,250,0.18)] hover:!border-[rgba(167,139,250,0.30)] bg-[linear-gradient(180deg,rgba(167,139,250,0.04),transparent_48%)] shadow-[0_0_18px_rgba(167,139,250,0.03)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.38)]",
};

export const PERSONA_DETAIL_ICON: Record<PersonaDetailAccent, string> = {
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  green:
    "border border-[var(--athena-success)]/40 bg-[var(--athena-success)]/15 text-[var(--athena-success)] shadow-[0_0_16px_rgba(0,208,132,0.18)]",
  amber:
    "border border-[rgba(196,146,92,0.34)] bg-[rgba(196,146,92,0.14)] text-amber-200 shadow-[0_0_14px_rgba(196,146,92,0.16)]",
  rose:
    "border border-[rgba(251,113,133,0.32)] bg-[rgba(251,113,133,0.12)] text-rose-300 shadow-[0_0_14px_rgba(251,113,133,0.16)]",
  cyan:
    "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  orange:
    "border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.18)]",
  blue:
    "border border-[rgba(96,165,250,0.32)] bg-[rgba(96,165,250,0.13)] text-blue-300 shadow-[0_0_14px_rgba(96,165,250,0.16)]",
  muted:
    "border border-[rgba(167,139,250,0.22)] bg-[rgba(167,139,250,0.08)] text-violet-200/80 shadow-[0_0_12px_rgba(167,139,250,0.08)]",
};

export const PERSONA_HEADER_ACTION_BASE =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40";

export const PERSONA_HEADER_PRIMARY_CLASS =
  `${PERSONA_HEADER_ACTION_BASE} bg-[var(--athena-orange)] text-white shadow-lg shadow-orange-500/20 hover:opacity-90 focus-visible:ring-[var(--athena-orange)]/50`;

export const PERSONA_HEADER_SECONDARY_CLASS =
  `${PERSONA_HEADER_ACTION_BASE} border border-white/15 bg-white/[0.03] text-white/85 hover:border-white/25 hover:text-white focus-visible:ring-white/30`;

export const PERSONA_HEADER_OBSERVATION_CLASS =
  `${PERSONA_HEADER_ACTION_BASE} border border-[rgba(167,139,250,0.36)] bg-[rgba(167,139,250,0.10)] text-violet-100 shadow-[0_0_16px_rgba(167,139,250,0.08)] hover:border-[rgba(167,139,250,0.52)] hover:shadow-[0_0_22px_rgba(167,139,250,0.16)] focus-visible:ring-violet-300/40`;

/** @deprecated Use PERSONA_HEADER_OBSERVATION_CLASS */
export const PERSONA_HEADER_TEACH_CLASS = PERSONA_HEADER_OBSERVATION_CLASS;

export const PERSONA_HEADER_REFRESH_CLASS =
  `${PERSONA_HEADER_ACTION_BASE} border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.08)] text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.08)] hover:border-[rgba(167,139,250,0.36)] hover:bg-[rgba(167,139,250,0.08)] focus-visible:ring-sky-300/40`;

export const PERSONA_HEADER_GENERATE_CLASS =
  `${PERSONA_HEADER_ACTION_BASE} border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.10)] text-orange-100 shadow-[0_0_14px_rgba(255,102,0,0.08)] hover:border-[rgba(255,102,0,0.48)] hover:bg-[rgba(255,102,0,0.14)] focus-visible:ring-[var(--athena-orange)]/40`;

export const PERSONA_HEADER_ALTERNATIVE_CLASS =
  `${PERSONA_HEADER_ACTION_BASE} border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/[0.08] text-[var(--athena-success)] hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/12 focus-visible:ring-[var(--athena-success)]/40`;

export const PERSONA_ASSET_CARD_VIOLET_CLASS =
  "relative overflow-hidden rounded-2xl border border-[rgba(167,139,250,0.24)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),transparent_52%)] shadow-[0_0_18px_rgba(167,139,250,0.05)]";

export const PERSONA_ASSET_CARD_ORANGE_CLASS =
  "relative overflow-hidden rounded-2xl border border-[rgba(255,102,0,0.24)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_52%)] shadow-[0_0_18px_rgba(255,102,0,0.05)]";

export const PERSONA_LIFECYCLE_COMPACT_CLASS =
  "inline-flex h-11 min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3";

export const PERSONA_NESTED_CARD_CLASS =
  "rounded-2xl border border-white/10 bg-black/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_70%)] p-4";

export const PERSONA_FIELD_CHIP_CLASS =
  "inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm leading-5 text-white/75";

export const PERSONA_CONFIDENCE_RING_COLOR: Record<ConfidenceLabel, string> = {
  High: "rgb(0, 208, 132)",
  Medium: "rgb(196, 146, 92)",
  Low: "rgb(251, 113, 133)",
};

export const PERSONA_CONFIDENCE_SURFACE: Record<ConfidenceLabel, string> = {
  High: "shrink-0 rounded-2xl border border-[rgba(0,208,132,0.28)] bg-[rgba(0,208,132,0.08)] px-2.5 py-2 shadow-[0_0_14px_rgba(0,208,132,0.08)]",
  Medium:
    "shrink-0 rounded-2xl border border-[rgba(196,146,92,0.30)] bg-[rgba(167,139,250,0.08)] px-2.5 py-2 shadow-[0_0_14px_rgba(167,139,250,0.08)]",
  Low: "shrink-0 rounded-2xl border border-[rgba(251,113,133,0.28)] bg-[rgba(255,102,0,0.08)] px-2.5 py-2 shadow-[0_0_14px_rgba(251,113,133,0.08)]",
};

export const PERSONA_CONFIDENCE_BAND_CLASS: Record<ConfidenceLabel, string> = {
  High: "text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--athena-success)]",
  Medium: "text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80",
  Low: "text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300/85",
};

export function personaIntelligenceChipClass(
  status: PersonaDisplayReadiness | string,
): string {
  if (status === "Ready") {
    return "inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,208,132,0.28)] bg-[rgba(0,208,132,0.10)] px-2.5 py-1 text-[11px] font-medium text-[var(--athena-success)]";
  }
  if (status === "Processing Failed") {
    return "inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200";
  }
  if (
    status === "Queued" ||
    status === "Processing" ||
    status === "Learning from Website" ||
    status === "Generating Executive Intelligence"
  ) {
    return "inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100";
  }
  return "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/55";
}
