/**
 * Ads campaign create (/ads/new) visual language.
 * Presentation-only. Does not change generation, brief, payload, or API semantics.
 * Does not mutate Ads-detail tokens or AD_DETAIL_DEFAULT_OPEN.
 */

import {
  AD_BACK_LINK_CLASS,
  AD_DETAIL_ICON,
  AD_DETAIL_SURFACE,
  AD_HEADER_ICON_WELL,
  AD_HEADER_PRIMARY_CLASS,
} from "./adCampaignDetailPresentation";

export const AD_CREATE_BACK_LINK_CLASS = AD_BACK_LINK_CLASS;
export const AD_CREATE_HEADER_ICON_WELL = AD_HEADER_ICON_WELL;
export const AD_CREATE_PRIMARY_CLASS = AD_HEADER_PRIMARY_CLASS;

export const AD_CREATE_CONTEXT_SURFACE = AD_DETAIL_SURFACE.violet;
export const AD_CREATE_CONTEXT_ICON = AD_DETAIL_ICON.violet;

/** Same violet family as context, slightly quieter so the brief is one card — not a second score. */
export const AD_CREATE_BRIEF_SURFACE =
  "relative overflow-hidden !border-[rgba(167,139,250,0.24)] hover:!border-[rgba(167,139,250,0.40)] bg-[linear-gradient(180deg,rgba(167,139,250,0.07),rgba(167,139,250,0.02)_38%,transparent_74%)] shadow-[0_0_20px_rgba(167,139,250,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.48)]";
export const AD_CREATE_BRIEF_ICON = AD_DETAIL_ICON.violet;

export const AD_CREATE_ADVANCED_SURFACE = AD_DETAIL_SURFACE.muted;
export const AD_CREATE_ADVANCED_ICON = AD_DETAIL_ICON.muted;

export const AD_CREATE_CARD_SHELL =
  "relative overflow-hidden rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8";

export const AD_CREATE_FIELD_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50";

export const AD_CREATE_FIELD_HELP_CLASS = "text-xs leading-5 text-white/40";

export const AD_CREATE_FIELD_CLASS =
  "w-full rounded-2xl border border-white/[0.10] bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-[rgba(167,139,250,0.45)] focus:ring-2 focus:ring-[rgba(167,139,250,0.18)]";

export const AD_CREATE_TEXTAREA_CLASS = `${AD_CREATE_FIELD_CLASS} resize-y leading-6`;

export const AD_CREATE_ERROR_CLASS =
  "flex items-start gap-2.5 rounded-2xl border border-rose-400/28 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100";
