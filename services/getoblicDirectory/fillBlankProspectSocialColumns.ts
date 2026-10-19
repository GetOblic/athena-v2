/**
 * Column-scoped fill of blank Prospect social columns.
 *
 * PostgREST ANDs separate query parameters. `.eq("id").eq("organization_id").or(...)`
 * therefore stays on one organization-owned row. `@supabase/postgrest-js` stores
 * `.or(filters)` as its own `or=(...)` parameter. `match` is that client's name
 * for POSIX `~`. The pattern is double-quoted because `:` inside `[[:space:]]`
 * is reserved in a PostgREST filter value (`, . : ( )`).
 *
 * `.select("id")` sets `Prefer: return=representation`. Zero matching rows come
 * back as `data: []` with no error. NULL does not satisfy `~`, so a blank cell
 * is `is.null` OR POSIX whitespace. The confirmation read treats the same ASCII
 * set as blank (`space`, tab, LF, VT, FF, CR), which is `[[:space:]]` in the C
 * locale.
 *
 * This is not `updateProspect`. Other Prospect writes keep that function.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";

export const PROSPECT_SOCIAL_COLUMNS = [
  "facebook",
  "instagram",
  "linkedin",
  "whatsapp_number",
] as const;

export type ProspectSocialColumn = (typeof PROSPECT_SOCIAL_COLUMNS)[number];

/**
 * One retry when a conditional update does not stick and the column is still
 * blank. A second miss is ambiguous and must not be reported as success.
 */
const SOCIAL_FILL_ATTEMPTS = 2;

/** Quoted so PostgREST keeps the colon inside `[[:space:]]` in the value. */
export const BLANK_PROSPECT_SOCIAL_MATCH = '"^[[:space:]]*$"';

export function blankProspectSocialOrFilter(column: ProspectSocialColumn): string {
  return `${column}.is.null,${column}.match.${BLANK_PROSPECT_SOCIAL_MATCH}`;
}

export function isBlankStoredProspectSocial(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  return /^[\t\n\v\f\r ]*$/.test(value);
}

export async function fillBlankProspectSocialColumns(args: {
  organizationId: string;
  prospectId: string;
  values: Partial<Record<ProspectSocialColumn, string | null | undefined>>;
  logLabel: string;
}): Promise<Partial<Record<ProspectSocialColumn, string>>> {
  const written: Partial<Record<ProspectSocialColumn, string>> = {};
  for (const column of PROSPECT_SOCIAL_COLUMNS) {
    const value = args.values[column];
    if (typeof value !== "string" || value.length === 0) continue;
    const didWrite = await fillSocialColumnIfStillBlank({
      organizationId: args.organizationId,
      prospectId: args.prospectId,
      column,
      value,
      logLabel: args.logLabel,
    });
    if (didWrite) written[column] = value;
  }
  return written;
}

async function fillSocialColumnIfStillBlank(args: {
  organizationId: string;
  prospectId: string;
  column: ProspectSocialColumn;
  value: string;
  logLabel: string;
}): Promise<boolean> {
  for (let attempt = 1; attempt <= SOCIAL_FILL_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("prospects")
      .update({ [args.column]: args.value })
      .eq("id", args.prospectId)
      .eq("organization_id", args.organizationId)
      .or(blankProspectSocialOrFilter(args.column))
      .select("id");

    if (!error) {
      const updatedId = readUpdatedProspectId(data);
      if (updatedId === args.prospectId) return true;
      if (updatedId === "ambiguous") {
        console.error(`${args.logLabel} update was ambiguous.`, {
          column: args.column,
        });
        throw socialImportConflict();
      }
    }

    const observed = await readScopedSocialColumn(args);
    if (observed === "present") return false;
    if (observed === "unconfirmed" || attempt === SOCIAL_FILL_ATTEMPTS) {
      console.error(
        `${args.logLabel} could not confirm an empty-column fill.`,
        {
          column: args.column,
          updateFailed: Boolean(error),
          confirmed: observed,
        },
      );
      throw socialImportConflict();
    }
  }
  throw socialImportConflict();
}

function readUpdatedProspectId(data: unknown): string | null | "ambiguous" {
  if (!Array.isArray(data)) return "ambiguous";
  if (data.length === 0) return null;
  if (data.length !== 1) return "ambiguous";
  const record = data[0];
  if (!record || typeof record !== "object") return "ambiguous";
  const id = (record as { id?: unknown }).id;
  if (typeof id !== "string" || !id) return "ambiguous";
  return id;
}

async function readScopedSocialColumn(args: {
  organizationId: string;
  prospectId: string;
  column: ProspectSocialColumn;
}): Promise<"blank" | "present" | "unconfirmed"> {
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("id, organization_id, facebook, instagram, linkedin, whatsapp_number")
    .eq("id", args.prospectId)
    .eq("organization_id", args.organizationId)
    .maybeSingle();

  if (error || !data || typeof data !== "object") return "unconfirmed";
  const row = data as {
    id?: unknown;
    organization_id?: unknown;
    facebook?: unknown;
    instagram?: unknown;
    linkedin?: unknown;
    whatsapp_number?: unknown;
  };
  if (row.id !== args.prospectId || row.organization_id !== args.organizationId) {
    return "unconfirmed";
  }
  return isBlankStoredProspectSocial(row[args.column]) ? "blank" : "present";
}

function socialImportConflict(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_CONCURRENCY_CONFLICT",
    "Athena couldn’t add this business. Try again.",
  );
}
