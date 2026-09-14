/**
 * Social Planner targeted-mode presentation helpers.
 * UUID shape and compact audience chip only — no Persona row access.
 */

export const SOCIAL_PLANNER_PERSONA_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SOCIAL_PLANNER_TARGET_CLEAR_HREF = "/social-planner";

export type SocialPlannerTargetAudienceView = {
  personaId: string;
  name: string;
  summary: string | null;
};

export function normalizeSocialPlannerPersonaId(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SOCIAL_PLANNER_PERSONA_ID_RE.test(trimmed) ? trimmed : null;
}

export function formatSocialPlannerTargetSummary(
  location: string | null | undefined,
  profile: string | null | undefined,
): string | null {
  const parts = [location?.trim(), profile?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const SOCIAL_TARGET_SURFACE_CLASS =
  "rounded-2xl border border-[rgba(56,189,248,0.22)] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(232,121,189,0.04)_62%,transparent_86%)] px-4 py-3";

export const SOCIAL_TARGET_CLEAR_CLASS =
  "shrink-0 text-xs font-medium text-white/45 underline-offset-2 transition hover:text-white/75 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]";
