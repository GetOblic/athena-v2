/**
 * Community Intelligence search qualification only.
 * Independent of OPENROUTER_ANALYSIS_MODEL and the generation stage routes.
 * One configured model. No fallback model.
 */

export const DEFAULT_COMMUNITY_QUALIFICATION_MODEL = "openai/gpt-4.1-nano";

export const COMMUNITY_QUALIFICATION_MODEL_ENV =
  "OPENROUTER_COMMUNITY_QUALIFICATION_MODEL";

/** OpenRouter `author/slug` ids, including an optional `:variant` suffix. */
const COMMUNITY_QUALIFICATION_MODEL_ID =
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export type CommunityQualificationModelResolution =
  | { status: "configured"; model: string }
  | { status: "invalid" };

export function resolveCommunityQualificationModel(
  env: Record<string, string | undefined> = process.env,
): CommunityQualificationModelResolution {
  const raw = env[COMMUNITY_QUALIFICATION_MODEL_ENV];
  if (raw === undefined || raw.trim() === "") {
    return {
      status: "configured",
      model: DEFAULT_COMMUNITY_QUALIFICATION_MODEL,
    };
  }

  const model = raw.trim();
  if (!COMMUNITY_QUALIFICATION_MODEL_ID.test(model)) {
    return { status: "invalid" };
  }

  return { status: "configured", model };
}
