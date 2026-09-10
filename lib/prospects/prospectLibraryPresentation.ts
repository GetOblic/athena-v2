/**
 * Presentation-only Prospect library surfaces.
 * Reuses the Prospect cyan/sky family. No scoring, claim, or sort logic.
 */

export const PROSPECT_LIBRARY_PRIMARY_ACTION =
  "inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--athena-orange)] px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 sm:w-auto";

export const PROSPECT_LIBRARY_SECONDARY_ACTION =
  "inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 text-sm font-semibold text-white/85 transition hover:border-white/25 hover:text-white sm:w-auto";

export const PROSPECT_TOOLBAR_SURFACE_CLASS =
  "grid gap-3 rounded-[24px] border border-white/10 bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.05),transparent_62%)] p-3 shadow-[0_0_22px_rgba(56,189,248,0.03)] sm:grid-cols-3 sm:p-4";

export const PROSPECT_TOOLBAR_FIELD_CLASS =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none transition focus:border-[rgba(56,189,248,0.36)]";

export const PROSPECT_CARD_SURFACE_CLASS =
  "relative min-w-0 overflow-hidden rounded-[24px] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(56,189,248,0.07),transparent_48%)] p-4 shadow-[0_0_22px_rgba(56,189,248,0.04)] transition hover:bg-white/[0.03] sm:p-5";

export const PROSPECT_CARD_ICON_WELL_CLASS =
  "grid size-10 shrink-0 place-items-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.13)] text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.16)]";

export const PROSPECT_SUMMARY_STRIP_CLASS =
  "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/50";

export const PROSPECT_SUMMARY_ITEM_CLASS =
  "inline-flex items-center gap-1.5";

export const PROSPECT_CAPACITY_SURFACE_CLASS =
  "mt-5 max-w-xl rounded-2xl border border-[rgba(56,189,248,0.22)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),transparent_70%)] px-4 py-3 shadow-[0_0_18px_rgba(56,189,248,0.05)]";

export const PROSPECT_CAPACITY_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200/70";

export const PROSPECT_COMPLETENESS_LIST_RING_PX = 44;

export const PROSPECT_WORKING_STATUS_CHIP_CLASS =
  "inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-white/40";

export function shouldShowProspectLibraryReleaseCta(
  status: string | null | undefined,
): status is "claiming" | "linked" {
  return status === "claiming" || status === "linked";
}
