import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";

export type AthenaBrainContext = {
  userId: string | null;
  identity: {
    about_you: string | null;
    expertise: string | null;
    website: string | null;
    master_profile: Record<string, unknown> | null;
  } | null;
};

export async function getAthenaBrainContextForCurrentUser(): Promise<AthenaBrainContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      identity: null,
    };
  }

  const identity = await getAthenaIdentityByUserId(user.id);

  return {
    userId: user.id,
    identity: identity
      ? {
          about_you: identity.about_you,
          expertise: identity.expertise,
          website: identity.website,
          master_profile: identity.master_profile,
        }
      : null,
  };
}

export function formatBrainContextForPrompt(context: AthenaBrainContext): string {
  if (!context.identity) {
    return `
ATHENA BRAIN CONTEXT:
No Athena Identity profile has been configured yet.

Use the discussion context only. Do not invent a user persona, brand voice, methodology, offers, or expertise.
`.trim();
  }

  return `
ATHENA BRAIN CONTEXT:

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
Do not invent offers, guarantees, credentials, or resources that are not present.
If the identity says to educate before selling, follow that principle.
If the identity contains professional terminology or methodology, use it naturally.
`.trim();
}
