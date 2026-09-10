/**
 * Presentation-only Prospect detail tokens and information architecture.
 * Does not change generation, scoring semantics, claim, or stored fields.
 */

export const PROSPECT_DETAIL_ANCHORS = {
  conversation: "prospect-conversation",
  conversationInput: "prospect-conversation-input",
  observation: "prospect-observation",
  observationField: "prospect-observation-field",
  profile: "prospect-profile",
  snapshot: "prospect-executive-snapshot",
  recommendation: "prospect-athena-recommendation",
  identity: "prospect-identity-contact",
  website: "prospect-website-research",
  getoblicDescription: "prospect-getoblic-description",
} as const;

export const PROSPECT_ASK_ATHENA_EVENT = "prospect-ask-athena";
export const PROSPECT_ADD_OBSERVATION_EVENT = "prospect-add-observation";
export const PROSPECT_EDIT_PROFILE_EVENT = "prospect-edit-profile";

export const PROSPECT_DETAIL_SECTION_ORDER = [
  "back",
  "header",
  "cta",
  "banners",
  "executive-snapshot",
  "athena-recommendation",
  "identity-contact",
  "website-intelligence",
  "getoblic-description",
  "commercial",
  "outreach",
  "ask-athena",
  "observation",
  "advanced",
] as const;

export type ProspectDetailSectionId =
  (typeof PROSPECT_DETAIL_SECTION_ORDER)[number];

export type ProspectDetailAccent =
  | "violet"
  | "green"
  | "amber"
  | "rose"
  | "cyan"
  | "orange"
  | "blue"
  | "muted";

export const PROSPECT_BACK_LINK_CLASS =
  "mb-6 inline-flex items-center gap-1.5 text-sm text-white/45 transition hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const PROSPECT_HEADER_ICON_WELL =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]";

export const PROSPECT_HEADER_ACTION_BASE =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40";

export const PROSPECT_PRIMARY_ACTION = `${PROSPECT_HEADER_ACTION_BASE} bg-[var(--athena-orange)] text-white shadow-lg shadow-orange-500/20 hover:opacity-90 focus-visible:ring-[var(--athena-orange)]/50`;

export const PROSPECT_SECONDARY_VIOLET_ACTION = `${PROSPECT_HEADER_ACTION_BASE} border border-[rgba(167,139,250,0.36)] bg-[rgba(167,139,250,0.10)] text-violet-100 shadow-[0_0_16px_rgba(167,139,250,0.08)] hover:border-[rgba(167,139,250,0.52)] hover:shadow-[0_0_22px_rgba(167,139,250,0.16)] focus-visible:ring-violet-300/40`;

export const PROSPECT_SECONDARY_GREEN_ACTION = `${PROSPECT_HEADER_ACTION_BASE} border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/[0.08] text-[var(--athena-success)] hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/12 focus-visible:ring-[var(--athena-success)]/40`;

export const PROSPECT_UTILITY_ACTION = `${PROSPECT_HEADER_ACTION_BASE} border border-white/15 bg-white/[0.03] text-white/85 hover:border-white/25 hover:text-white focus-visible:ring-white/30`;

export const PROSPECT_UTILITY_CYAN_ACTION = `${PROSPECT_HEADER_ACTION_BASE} border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.08)] text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.08)] hover:border-[rgba(56,189,248,0.42)] hover:bg-[rgba(56,189,248,0.12)] focus-visible:ring-sky-300/40`;

export const PROSPECT_UTILITY_VIOLET_ACTION = `${PROSPECT_HEADER_ACTION_BASE} border border-[rgba(167,139,250,0.28)] bg-[rgba(167,139,250,0.08)] text-violet-100 shadow-[0_0_14px_rgba(167,139,250,0.08)] hover:border-[rgba(167,139,250,0.44)] focus-visible:ring-violet-300/40`;

export const PROSPECT_DESTRUCTIVE_ACTION = `${PROSPECT_HEADER_ACTION_BASE} border border-rose-400/25 bg-rose-500/10 text-rose-100 hover:border-rose-400/40 hover:bg-rose-500/16 focus-visible:ring-rose-300/40`;

export const PROSPECT_LIFECYCLE_COMPACT_CLASS =
  "inline-flex h-11 min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3";

export const PROSPECT_CTA_GROUP_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40";

export const PROSPECT_SNAPSHOT_SURFACE =
  "relative !border-[rgba(167,139,250,0.30)] hover:!border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),transparent_48%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]";

export const PROSPECT_RECOMMENDATION_SURFACE =
  "relative !border-[var(--athena-success)]/35 hover:!border-[var(--athena-success)]/55 bg-[linear-gradient(180deg,rgba(0,208,132,0.08),transparent_48%)] shadow-[0_0_24px_rgba(0,208,132,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--athena-success)]/75";

export const PROSPECT_IDENTITY_SURFACE =
  "relative !border-[rgba(56,189,248,0.30)] hover:!border-[rgba(56,189,248,0.48)] bg-[linear-gradient(180deg,rgba(56,189,248,0.07),transparent_48%)] shadow-[0_0_24px_rgba(56,189,248,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]";

export const PROSPECT_COMMERCIAL_SURFACE =
  "relative !border-[rgba(196,146,92,0.34)] hover:!border-[rgba(196,146,92,0.50)] bg-[linear-gradient(180deg,rgba(196,146,92,0.08),transparent_48%)] shadow-[0_0_22px_rgba(196,146,92,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(196,146,92,0.72)]";

export const PROSPECT_CONTEXT_SURFACE =
  "relative !border-[rgba(167,139,250,0.30)] hover:!border-[rgba(167,139,250,0.48)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),transparent_48%)] shadow-[0_0_24px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]";

export const PROSPECT_RISK_SURFACE =
  "relative !border-[rgba(251,113,133,0.30)] hover:!border-[rgba(251,113,133,0.48)] bg-[linear-gradient(180deg,rgba(251,113,133,0.07),transparent_48%)] shadow-[0_0_22px_rgba(251,113,133,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,113,133,0.62)]";

export const PROSPECT_WEBSITE_SURFACE =
  "relative !border-[rgba(96,165,250,0.30)] hover:!border-[rgba(96,165,250,0.48)] bg-[linear-gradient(180deg,rgba(96,165,250,0.07),transparent_48%)] shadow-[0_0_22px_rgba(96,165,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(96,165,250,0.62)]";

export const PROSPECT_GETOBLIC_DESCRIPTION_SURFACE =
  "relative !border-[rgba(45,212,191,0.34)] hover:!border-[rgba(45,212,191,0.52)] bg-[linear-gradient(180deg,rgba(0,208,132,0.07),rgba(56,189,248,0.05)_48%,transparent_72%)] shadow-[0_0_24px_rgba(45,212,191,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(45,212,191,0.72)]";

export const PROSPECT_MUTED_SURFACE =
  "relative !border-[rgba(167,139,250,0.18)] hover:!border-[rgba(167,139,250,0.30)] bg-[linear-gradient(180deg,rgba(167,139,250,0.04),transparent_48%)] shadow-[0_0_18px_rgba(167,139,250,0.03)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.38)]";

export const PROSPECT_DETAIL_ICON: Record<ProspectDetailAccent, string> = {
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

export const PROSPECT_DETAIL_SURFACE: Record<ProspectDetailAccent, string> = {
  violet: PROSPECT_SNAPSHOT_SURFACE,
  green: PROSPECT_RECOMMENDATION_SURFACE,
  amber: PROSPECT_COMMERCIAL_SURFACE,
  rose: PROSPECT_RISK_SURFACE,
  cyan: PROSPECT_IDENTITY_SURFACE,
  orange:
    "relative !border-[rgba(255,102,0,0.30)] hover:!border-[rgba(255,102,0,0.48)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),rgba(167,139,250,0.04)_42%,transparent_72%)] shadow-[0_0_24px_rgba(255,102,0,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.68)]",
  blue: PROSPECT_WEBSITE_SURFACE,
  muted: PROSPECT_MUTED_SURFACE,
};

export const PROSPECT_STATUS_CHIP_READY =
  "inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,208,132,0.28)] bg-[rgba(0,208,132,0.10)] px-2.5 py-1 text-[11px] font-medium text-[var(--athena-success)]";

export const PROSPECT_STATUS_CHIP_FAILED =
  "inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200";

export const PROSPECT_STATUS_CHIP_PROGRESS =
  "inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100";

export const PROSPECT_STATUS_CHIP_SAVED =
  "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/55";

export const PROSPECT_COMPLETENESS_RING_PX = 72;

export const PROSPECT_COMPLETENESS_RING_COLOR = {
  Low: "rgb(251, 113, 133)",
  Medium: "rgb(196, 146, 92)",
  Strong: "rgb(0, 208, 132)",
  Excellent: "rgb(16, 185, 129)",
} as const;

export const PROSPECT_COMPLETENESS_SURFACE = {
  Low: "shrink-0 rounded-2xl border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.08)] px-2.5 py-2 shadow-[0_0_14px_rgba(251,113,133,0.08)]",
  Medium:
    "shrink-0 rounded-2xl border border-[rgba(196,146,92,0.30)] bg-[rgba(196,146,92,0.08)] px-2.5 py-2 shadow-[0_0_14px_rgba(196,146,92,0.08)]",
  Strong:
    "shrink-0 rounded-2xl border border-[rgba(0,208,132,0.28)] bg-[rgba(0,208,132,0.08)] px-2.5 py-2 shadow-[0_0_14px_rgba(0,208,132,0.08)]",
  Excellent:
    "shrink-0 rounded-2xl border border-[rgba(16,185,129,0.40)] bg-[rgba(16,185,129,0.12)] px-2.5 py-2 shadow-[0_0_18px_rgba(16,185,129,0.14)]",
} as const;

export const PROSPECT_COMPLETENESS_BAND_CLASS = {
  Low: "text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300/85",
  Medium: "text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80",
  Strong:
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--athena-success)]",
  Excellent:
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200",
} as const;

export const PROSPECT_FIELD_CHIP_CLASS =
  "inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm leading-5 text-white/75";

export const PROSPECT_EDITOR_FIELD_CLASS =
  "w-full rounded-2xl border border-[rgba(56,189,248,0.18)] bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.42)]";

export function prospectIntelligenceChipClass(status: string): string {
  if (status === "Ready") return PROSPECT_STATUS_CHIP_READY;
  if (status === "Processing Failed") return PROSPECT_STATUS_CHIP_FAILED;
  if (
    status === "Queued" ||
    status === "Processing" ||
    status === "Learning from Website" ||
    status === "Generating Executive Intelligence"
  ) {
    return PROSPECT_STATUS_CHIP_PROGRESS;
  }
  return PROSPECT_STATUS_CHIP_SAVED;
}

export function dispatchProspectDetailEvent(name: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(name));
}

export function focusProspectAnchor(
  sectionId: string,
  fieldId?: string,
  delay = 0,
): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    if (fieldId) {
      document.getElementById(fieldId)?.focus();
    }
  }, delay);
}
