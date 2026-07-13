export const SHARED_FORBIDDEN_PHRASES = [
  "comprehensive guide",
  "ultimate guide",
  "valuable insights",
  "hope this helps",
  "great question",
  "join our webinar",
  "comment below",
  "reach out if you have questions",
  "take your business to the next level",
] as const;

export const SHARED_ANTI_GENERIC_RULES = `
Quality standard:
- Copy must not work for any random business.
- Include one non-obvious insight from THIS discussion.
- Use organization voice and domain terminology from Business Context.
- Sound human, confident, field-tested — not generic AI.
- Banned phrases: ${SHARED_FORBIDDEN_PHRASES.join(", ")}.
`.trim();

export const SHARED_OUTPUT_DIVERSITY_RULES = `
Expression diversity:
- Preserve the same business conclusions when evidence is unchanged.
- Vary framing, sequencing, hooks, and structure across regenerations when multiple valid approaches exist.
- Do not reuse identical sentences or templates from prior outputs when regenerating.
`.trim();

export const SHARED_JSON_OUTPUT_RULES = `
Return ONLY valid JSON. No markdown. No code fences. No text outside the JSON object.
`.trim();

export const DEPLOYMENT_SECTION_LABELS = `
COMMUNITY_REPLY:
PRIVATE_MESSAGE:
SOCIAL_POST:
FOLLOW_UP:
CALL_TO_ACTION:
NEWSLETTER_IDEA:
BLOG_POST_IDEA:
`.trim();

export const DEPLOYMENT_CHANNEL_GUIDE = `
COMMUNITY_REPLY — natural in-group reply; useful insight; one sharp distinction; soft invitation.
PRIVATE_MESSAGE — short, warm, references exact concern; one next step.
FOLLOW_UP — one qualifying question that creates momentum.
SOCIAL_POST — market insight or belief shift; platform-ready; not educational filler.
CALL_TO_ACTION — one paste-ready sentence tied to the insight; low-friction.
NEWSLETTER_IDEA — concept for the Athena client's audience newsletter (not outreach to a prospect): subject/title, central angle, why relevant now, key points/sections, suggested CTA, optional opening hook.
BLOG_POST_IDEA — concept for the Athena client's audience blog (not a full article): proposed title, search/reader intent, central thesis, recommended outline, key expert insights, suggested CTA, optional differentiation angle.
`.trim();

export const SHARED_DEPLOYMENT_QUALITY = `
${SHARED_ANTI_GENERIC_RULES}

${DEPLOYMENT_CHANNEL_GUIDE}

Use exact section labels:
${DEPLOYMENT_SECTION_LABELS}

${SHARED_OUTPUT_DIVERSITY_RULES}
`.trim();
