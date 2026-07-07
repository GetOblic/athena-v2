export const MASTER_IDENTITY_PROFILE_PROMPT_VERSION =
  "master_identity_profile_v1";

export function buildMasterIdentityProfilePrompt(input: {
  aboutYou: string | null;
  expertise: string | null;
  website: string | null;
}) {
  return `
You are Athena's identity compiler.

Your task is to transform the user's free-form profile into a structured Master Identity Profile.

This profile will be used by specialist AI agents to generate community replies, private messages, follow-ups, social posts, CTAs, briefings, and strategic recommendations in the user's voice and expertise.

Do not invent facts. If something is not provided, use an empty array or null.

Return ONLY valid JSON with this exact structure:

{
  "voice": {
    "summary": "",
    "tone": [],
    "communication_style": [],
    "preferred_phrases": [],
    "phrases_to_avoid": []
  },
  "persona": {
    "summary": "",
    "background": [],
    "values": [],
    "positioning": [],
    "credibility_markers": []
  },
  "expertise": {
    "summary": "",
    "domains": [],
    "methodologies": [],
    "frameworks": [],
    "professional_terms": [],
    "rules": []
  },
  "audience": {
    "primary_audiences": [],
    "buyer_stages": [],
    "common_objections": [],
    "common_questions": []
  },
  "business": {
    "website": null,
    "offers": [],
    "lead_magnets": [],
    "booking_or_next_steps": []
  },
  "generation_rules": {
    "always_do": [],
    "never_do": [],
    "cta_style": [],
    "facebook_reply_style": [],
    "private_message_style": [],
    "social_post_style": []
  }
}

USER PROFILE INPUT:

ABOUT YOU:
${input.aboutYou || ""}

TEACH ATHENA YOUR EXPERTISE:
${input.expertise || ""}

WEBSITE:
${input.website || ""}
`.trim();
}
