/**
 * LinkedIn Prospect Deployment Asset length contract.
 * Applies only to Prospect Intelligence LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP.
 *
 * Prompt wording is a soft generation target. Deterministic repair + validation
 * enforce the hard persisted maximum of PROSPECT_LINKEDIN_ASSET_MAX_CHARS.
 */

export const PROSPECT_LINKEDIN_ASSET_MAX_CHARS = 200;

export const PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS = [
  "LINKEDIN_CONNECTION",
  "LINKEDIN_FOLLOW_UP",
] as const;

export type ProspectLinkedInLengthLimitedKey =
  (typeof PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS)[number];

export const LINKEDIN_PROSPECT_ASSET_GENERATION_RULES = `
LINKEDIN_CONNECTION and LINKEDIN_FOLLOW_UP length guidance:
- Target approximately ${PROSPECT_LINKEDIN_ASSET_MAX_CHARS} characters for each asset body, including spaces and punctuation.
- Preferably remain under ${PROSPECT_LINKEDIN_ASSET_MAX_CHARS} characters.
- Keep each message concise, natural, personalized, and complete.
- Avoid unnecessary filler, padding, or multi-paragraph LinkedIn notes.
- Preserve personalized LinkedIn tone, one clear purpose, and a clear CTA/ask.
`.trim();
