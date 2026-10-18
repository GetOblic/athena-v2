/**
 * Product limits for GetOblic Description and Knowledge Base text.
 * Description matches the legacy generator. Knowledge Base is the approved
 * editor limit, which is tighter than the artifact table's storage ceiling.
 */

export { GETOBLIC_DESCRIPTION_MAX_CHARS } from "@/services/prospects/prospectGeneratedListingDescription";

export const GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS = 20_000;
