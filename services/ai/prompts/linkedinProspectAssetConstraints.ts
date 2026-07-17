/**
 * LinkedIn Prospect Deployment Asset length contract.
 * Applies only to Prospect Intelligence LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP.
 */

export const PROSPECT_LINKEDIN_ASSET_MAX_CHARS = 200;

export const PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS = [
  "LINKEDIN_CONNECTION",
  "LINKEDIN_FOLLOW_UP",
] as const;

export type ProspectLinkedInLengthLimitedKey =
  (typeof PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS)[number];

export const LINKEDIN_PROSPECT_ASSET_GENERATION_RULES = `
LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP hard length limits (required):
- LINKEDIN_CONNECTION must be no more than ${PROSPECT_LINKEDIN_ASSET_MAX_CHARS} characters, including spaces and punctuation.
- LINKEDIN_FOLLOW_UP must be no more than ${PROSPECT_LINKEDIN_ASSET_MAX_CHARS} characters, including spaces and punctuation.
- Count every character in the asset body under the heading (spaces, punctuation, line breaks).
- Do not exceed ${PROSPECT_LINKEDIN_ASSET_MAX_CHARS} characters for either asset.
- Preserve personalized LinkedIn tone, one clear purpose, and a clear CTA/ask within the limit.
- Prefer shorter, natural LinkedIn notes over padded or multi-paragraph copy.
`.trim();
