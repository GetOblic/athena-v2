/**
 * Ads campaign detail visual language.
 * Presentation-only. Does not import SEO/Persona modules or change generation.
 */

export const AD_DETAIL_SECTION_KEYS = [
  "campaignStrategy",
  "facebook",
  "instagram",
  "tiktok",
  "googleSearchAds",
  "recommendedKeywordThemes",
  "advanced",
] as const;

export type AdDetailSectionKey = (typeof AD_DETAIL_SECTION_KEYS)[number];

export type AdDetailAccent = "violet" | "cyan" | "amber" | "muted";

export const AD_DETAIL_DEFAULT_OPEN = {
  campaignStrategy: false,
  facebook: false,
  instagram: false,
  tiktok: false,
  googleSearchAds: false,
  recommendedKeywordThemes: false,
  advanced: false,
} as const satisfies Record<AdDetailSectionKey, boolean>;

export const AD_DETAIL_SECTION_PRESENTATION = {
  campaignStrategy: {
    accent: "violet",
    defaultOpen: false,
    icon: "Target",
  },
  facebook: {
    accent: "cyan",
    defaultOpen: false,
    icon: "Monitor",
  },
  instagram: {
    accent: "cyan",
    defaultOpen: false,
    icon: "Image",
  },
  tiktok: {
    accent: "cyan",
    defaultOpen: false,
    icon: "Video",
  },
  googleSearchAds: {
    accent: "cyan",
    defaultOpen: false,
    icon: "Search",
  },
  recommendedKeywordThemes: {
    accent: "amber",
    defaultOpen: false,
    icon: "ListChecks",
  },
  advanced: {
    accent: "muted",
    defaultOpen: false,
    icon: "Layers",
  },
} as const satisfies Record<
  AdDetailSectionKey,
  { accent: AdDetailAccent; defaultOpen: boolean; icon: string }
>;

export const AD_DETAIL_SURFACE: Record<AdDetailAccent, string> = {
  violet:
    "relative overflow-hidden !border-[rgba(167,139,250,0.32)] hover:!border-[rgba(167,139,250,0.50)] bg-[linear-gradient(180deg,rgba(167,139,250,0.10),rgba(167,139,250,0.03)_38%,transparent_74%)] shadow-[0_0_24px_rgba(167,139,250,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.62)]",
  cyan: "relative overflow-hidden !border-[rgba(56,189,248,0.32)] hover:!border-[rgba(56,189,248,0.50)] bg-[linear-gradient(180deg,rgba(56,189,248,0.10),rgba(56,189,248,0.03)_38%,transparent_74%)] shadow-[0_0_24px_rgba(56,189,248,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.65)]",
  amber:
    "relative overflow-hidden !border-[rgba(251,191,36,0.28)] hover:!border-[rgba(251,191,36,0.46)] bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(251,191,36,0.03)_38%,transparent_74%)] shadow-[0_0_22px_rgba(251,191,36,0.05)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,191,36,0.58)]",
  muted:
    "relative overflow-hidden !border-[rgba(167,139,250,0.18)] hover:!border-[rgba(167,139,250,0.30)] bg-[linear-gradient(180deg,rgba(167,139,250,0.05),rgba(167,139,250,0.02)_38%,transparent_74%)] shadow-[0_0_18px_rgba(167,139,250,0.03)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.38)]",
};

/** Expanded Ads field rows — flatter than the old executive nested cards. */
export const AD_DETAIL_FIELD_LIST_CLASS = "divide-y divide-white/[0.06]";

export const AD_DETAIL_FIELD_ROW_CLASS =
  "rounded-none bg-transparent px-0 py-4 first:pt-0 last:pb-0";

export const AD_DETAIL_FIELD_LABEL_CLASS =
  "min-w-0 text-[11px] font-medium tracking-wide text-white/42";

export const AD_DETAIL_FIELD_VALUE_CLASS =
  "mt-1.5 max-w-3xl whitespace-pre-wrap rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white/80";

export const AD_DETAIL_ICON: Record<AdDetailAccent, string> = {
  violet:
    "border border-[rgba(167,139,250,0.32)] bg-[rgba(167,139,250,0.13)] text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.16)]",
  cyan: "border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.18)]",
  amber:
    "border border-[rgba(251,191,36,0.30)] bg-[rgba(251,191,36,0.10)] text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.14)]",
  muted:
    "border border-[rgba(167,139,250,0.22)] bg-[rgba(167,139,250,0.08)] text-violet-200/80 shadow-[0_0_12px_rgba(167,139,250,0.08)]",
};

export const AD_HEADER_ICON_WELL =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(255,102,0,0.32)] bg-[rgba(255,102,0,0.14)] text-[var(--athena-orange)] shadow-[0_0_16px_rgba(255,102,0,0.18)]";

export const AD_HEADER_PRIMARY_CLASS =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-orange)]/50 disabled:cursor-not-allowed disabled:opacity-40";

export const AD_BACK_LINK_CLASS =
  "inline-flex items-center gap-1.5 text-sm text-white/45 transition hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const AD_CHIP_READY =
  "inline-flex items-center rounded-full border border-[var(--athena-success)]/35 bg-[var(--athena-success)]/12 px-3 py-1 text-xs font-semibold text-[var(--athena-success)]";

export const AD_CHIP_PROGRESS =
  "inline-flex items-center rounded-full border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.12)] px-3 py-1 text-xs font-semibold text-sky-200";

export const AD_CHIP_FAILED =
  "inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100";

export const AD_CHIP_META =
  "inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70";

export const AD_STATUS_PANEL_PROGRESS =
  "relative overflow-hidden rounded-[24px] border border-[rgba(56,189,248,0.28)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.10),rgba(167,139,250,0.06)_48%,transparent_78%)] p-6 shadow-[0_0_24px_rgba(56,189,248,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(56,189,248,0.62)]";

export const AD_STATUS_PANEL_FAILED =
  "relative overflow-hidden rounded-[24px] border border-rose-400/28 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(251,113,133,0.10),transparent_62%)] p-6 shadow-[0_0_22px_rgba(251,113,133,0.06)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-rose-400/70";

export const AD_STATUS_ICON_PROGRESS =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.16)]";

export const AD_STATUS_ICON_FAILED =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-rose-400/30 bg-rose-500/12 text-rose-200 shadow-[0_0_14px_rgba(251,113,133,0.16)]";

export function adCampaignStatusChipClass(status: string): string {
  if (status === "Ready") return AD_CHIP_READY;
  if (status === "Processing Failed") return AD_CHIP_FAILED;
  if (status === "Queued" || status === "Processing") return AD_CHIP_PROGRESS;
  return AD_CHIP_META;
}

function trimmedOrNull(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function presentAdCampaignTheme(
  theme?: string | null,
  campaignName?: string | null,
  strategyCampaignName?: string | null,
): string | null {
  const value = trimmedOrNull(theme);
  if (!value) return null;
  const name = trimmedOrNull(campaignName);
  const strategyName = trimmedOrNull(strategyCampaignName);
  if (name && value.toLowerCase() === name.toLowerCase()) return null;
  if (strategyName && value.toLowerCase() === strategyName.toLowerCase()) {
    return null;
  }
  return value;
}

export function presentAdCampaignDirectionSummary(input: {
  audience?: string | null;
  objective?: string | null;
}): string | null {
  const audience = trimmedOrNull(input.audience);
  const objective = trimmedOrNull(input.objective);
  if (audience && objective && audience.toLowerCase() !== objective.toLowerCase()) {
    return `${objective} · ${audience}`;
  }
  return audience ?? objective;
}

export type AdCampaignSnapshot = {
  objective: string | null;
  audience: string | null;
  campaignTheme: string | null;
};

export function presentAdCampaignSnapshot(input: {
  name: string;
  objective?: string | null;
  campaignTheme?: string | null;
  strategyAudience?: string | null;
  strategyObjective?: string | null;
  strategyCampaignName?: string | null;
  strategyCampaignTheme?: string | null;
}): AdCampaignSnapshot {
  return {
    objective:
      trimmedOrNull(input.strategyObjective) ?? trimmedOrNull(input.objective),
    audience: trimmedOrNull(input.strategyAudience),
    campaignTheme: presentAdCampaignTheme(
      input.strategyCampaignTheme ?? input.campaignTheme,
      input.name,
      input.strategyCampaignName,
    ),
  };
}
