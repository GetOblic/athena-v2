import { generateReview } from "@/services/aiService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildMasterIdentityProfilePrompt,
  MASTER_IDENTITY_PROFILE_PROMPT_VERSION,
} from "@/services/identity/prompts/masterIdentityProfilePrompt";

export type AthenaIdentity = {
  id: string;
  user_id: string;
  about_you: string | null;
  expertise: string | null;
  website: string | null;
  brain_status: string;
  brain_last_updated: string | null;
  master_profile: Record<string, unknown> | null;
  master_profile_version: string | null;
  master_profile_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertAthenaIdentityInput = {
  userId: string;
  aboutYou?: string | null;
  expertise?: string | null;
  website?: string | null;
};

export async function getAthenaIdentityByUserId(
  userId: string,
): Promise<AthenaIdentity | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching Athena identity:", error);
    return null;
  }

  return data;
}

export async function upsertAthenaIdentity(
  input: UpsertAthenaIdentityInput,
): Promise<AthenaIdentity | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .upsert(
      {
        user_id: input.userId,
        about_you: input.aboutYou ?? null,
        expertise: input.expertise ?? null,
        website: input.website ?? null,
        brain_status: "ready",
        brain_last_updated: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    console.error("Error saving Athena identity:", error);
    return null;
  }

  return compileMasterIdentityProfile(data);
}


function parseJsonResponse(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

export async function compileMasterIdentityProfile(identity: AthenaIdentity) {
  const prompt = buildMasterIdentityProfilePrompt({
    aboutYou: identity.about_you,
    expertise: identity.expertise,
    website: identity.website,
  });

  const rawProfile = await generateReview(prompt);
  const masterProfile = parseJsonResponse(rawProfile);

  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .update({
      master_profile: masterProfile,
      master_profile_version: MASTER_IDENTITY_PROFILE_PROMPT_VERSION,
      master_profile_generated_at: new Date().toISOString(),
      brain_status: "ready",
      brain_last_updated: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", identity.id)
    .select("*")
    .single();

  if (error) {
    console.error("Error saving master identity profile:", error);
    return identity;
  }

  return data;
}
