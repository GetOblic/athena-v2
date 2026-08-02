/** Pure Brain identity prompt formatter — no DB / Supabase imports. */

export type PromptIdentityContext = {
  userId: string | null;
  organizationId: string | null;
  identity: {
    about_you: string | null;
    expertise: string | null;
    website: string | null;
    master_profile: Record<string, unknown> | null;
  } | null;
};

export function getEmptyAthenaBrainContext(): PromptIdentityContext {
  return {
    userId: null,
    organizationId: null,
    identity: null,
  };
}

export function formatBrainContextForPrompt(context: PromptIdentityContext): string {
  if (!context.identity) {
    return `
ATHENA BRAIN CONTEXT:
No Athena Identity profile has been configured yet.

Use the discussion context only. Do not invent a user persona, brand voice, methodology, offers, resources, lead magnets, or expertise.
`.trim();
  }

  return `
ATHENA BRAIN CONTEXT:

USER ID:
${context.userId || "Not available."}

ABOUT THE USER:
${context.identity.about_you || "Not provided."}

USER EXPERTISE:
${context.identity.expertise || "Not provided."}

USER WEBSITE:
${context.identity.website || "Not provided."}

MASTER IDENTITY PROFILE:
${JSON.stringify(context.identity.master_profile ?? {}, null, 2)}

INSTRUCTIONS:
Use this identity context as the user's voice, expertise, methodology, terminology, rules, positioning, and CTA style.

Do not contradict it.
Do not invent credentials, guarantees, income promises, or unsupported claims.
Strategic asset recommendations are allowed, but phrase them as recommended/suggested assets unless the asset is explicitly present in the user's identity, website, documents, or existing resources.
If the identity says to educate before selling, follow that principle.
If the identity contains professional terminology or methodology, use it naturally.
`.trim();
}
