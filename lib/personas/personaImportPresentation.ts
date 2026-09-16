/**
 * Personas import (/personas/import) visual language.
 * Presentation-only. Does not change generation, creation, CSV import, or API semantics.
 * Does not mutate personaPagePresentation token values.
 */

import {
  PERSONA_CARD_ICON_WELL_CLASS,
  PERSONA_DETAIL_ICON,
  PERSONA_DETAIL_SURFACE,
  PERSONA_HEADER_PRIMARY_CLASS,
  PERSONA_HEADER_SECONDARY_CLASS,
  PERSONA_NESTED_CARD_CLASS,
} from "./personaPagePresentation";

export const PERSONA_IMPORT_BACK_LINK_CLASS =
  "inline-flex items-center gap-1.5 text-sm text-white/45 transition hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";

export const PERSONA_IMPORT_HEADER_ICON_WELL = `grid size-10 shrink-0 place-items-center rounded-2xl ${PERSONA_DETAIL_ICON.orange}`;

export const PERSONA_IMPORT_PRIMARY_CLASS = PERSONA_HEADER_PRIMARY_CLASS;
export const PERSONA_IMPORT_SECONDARY_CLASS = PERSONA_HEADER_SECONDARY_CLASS;
export const PERSONA_IMPORT_NESTED_CARD_CLASS = PERSONA_NESTED_CARD_CLASS;
export const PERSONA_IMPORT_CARD_ICON_WELL_CLASS = PERSONA_CARD_ICON_WELL_CLASS;

export const PERSONA_IMPORT_GENERATE_SURFACE = PERSONA_DETAIL_SURFACE.orange;
export const PERSONA_IMPORT_GENERATE_ICON = PERSONA_DETAIL_ICON.orange;

export const PERSONA_IMPORT_MANUAL_SURFACE = PERSONA_DETAIL_SURFACE.violet;
export const PERSONA_IMPORT_MANUAL_ICON = PERSONA_DETAIL_ICON.violet;

export const PERSONA_IMPORT_CSV_SURFACE = PERSONA_DETAIL_SURFACE.cyan;
export const PERSONA_IMPORT_CSV_ICON = PERSONA_DETAIL_ICON.cyan;

export const PERSONA_IMPORT_ADVANCED_SURFACE = PERSONA_DETAIL_SURFACE.muted;
export const PERSONA_IMPORT_ADVANCED_ICON = PERSONA_DETAIL_ICON.muted;

export const PERSONA_IMPORT_FIELD_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50";

export const PERSONA_IMPORT_FIELD_HELP_CLASS = "text-xs leading-5 text-white/40";

export const PERSONA_IMPORT_ERROR_CLASS =
  "flex items-start gap-2.5 rounded-2xl border border-rose-400/28 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100 whitespace-pre-wrap";

export const PERSONA_IMPORT_SUCCESS_CLASS =
  "rounded-2xl border border-[var(--athena-success)]/35 bg-[var(--athena-success)]/10 px-4 py-4 text-sm leading-6 text-[var(--athena-success)] whitespace-pre-wrap";

export const PERSONA_IMPORT_STATUS_CLASS = `${PERSONA_NESTED_CARD_CLASS} text-sm leading-6 text-white/65`;

export const PERSONA_IMPORT_RESULT_CLASS = `${PERSONA_NESTED_CARD_CLASS} text-sm text-white/70 whitespace-pre-wrap`;
