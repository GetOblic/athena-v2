/**
 * Social Voice Post generation contract — Prospect Deployment Assets only.
 * First-person market observation in the Athena client's Voice.
 */

export const SOCIAL_VOICE_POST_GENERATION_RULES = `
SOCIAL_VOICE_POST formatting (required):
SOCIAL_VOICE_POST:
[first-person social post body only]

Rules for Social Voice Post:
- Write in first person singular as the Athena client speaking directly.
- Follow the client's Athena Brain Voice field — tone, communication style, phrasing, and authority.
- Reflect the client's role, expertise, positioning, and lived professional perspective.
- Address the specific signal, pain point, or opportunity found in the Prospect analysis.
- Use Prospect notes, website intelligence, ads content, and current metadata when relevant.
- Sound like a genuine personal observation, not generic marketing copy or a sales template.
- Prioritize insight and lived experience before any promotion.
- Speak to the audience directly in language natural for LinkedIn, Facebook, Instagram caption, or similar social publishing.
- Do not invent facts, experiences, results, client conversations, or prior relationships.
- Avoid hashtags unless clearly appropriate to the client's Voice.
- End with a natural reflection, question, or restrained CTA when appropriate.
- Target length: approximately 150–350 words.
- Return only the post content under SOCIAL_VOICE_POST — no nested TITLE/POST sublabels unless naturally part of the prose.
`.trim();
