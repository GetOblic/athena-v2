/**
 * Prospect Library / Home visibility for active Prospect ↔ client conversions.
 *
 * Home source contracts forbid importing services/licensee/* directly.
 * This module is the allowed integration point for those surfaces.
 */

export {
  excludeActivelyConvertedProspects,
  listActiveConvertedProspectIdsForOrganization,
  prospectHasActiveClientConversion,
} from "@/services/licensee/licenseeProspectClientConversionReads";
