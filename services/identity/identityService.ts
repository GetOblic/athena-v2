import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AthenaIdentity = {
  id: string;
  user_id: string;
  about_you: string | null;
  expertise: string | null;
  website: string | null;
  brain_status: string;
  brain_last_updated: string | null;
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

  return data;
}
