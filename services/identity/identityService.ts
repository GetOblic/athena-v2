import { generateReview } from "@/services/aiService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertTenantRecord, createTenantScope } from "@/lib/tenantDatabase";
import {
  buildMasterIdentityProfilePrompt,
  MASTER_IDENTITY_PROFILE_PROMPT_VERSION,
} from "@/services/identity/prompts/masterIdentityProfilePrompt";

export type AthenaIdentity = {
  id: string;
  user_id: string;
  organization_id: string | null;
  greeting_name: string | null;
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
  organizationId: string;
  greetingName?: string | null;
  aboutYou?: string | null;
  expertise?: string | null;
  website?: string | null;
};

function parseJsonResponse(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function extractReadableTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function fetchWebsiteHomepageText(
  website: string | null,
): Promise<string | null> {
  const url = normalizeUrl(website);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "AthenaIdentityBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return `Athena could not read the homepage. HTTP status: ${response.status}`;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
      return `Athena could not read the homepage because it is not HTML. Content-Type: ${contentType}`;
    }

    const html = await response.text();
    return extractReadableTextFromHtml(html);
  } catch (error) {
    return `Athena could not read the homepage. ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}

export async function getAthenaIdentityByUserId(
  userId: string,
  organizationId: string,
): Promise<AthenaIdentity | null> {
  const tenant = createTenantScope(organizationId);
  const { data, error } = await tenant
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

export async function compileMasterIdentityProfile(
  identity: AthenaIdentity,
  organizationId: string,
) {
  if (!assertTenantRecord(identity, organizationId)) {
    return identity;
  }

  const websiteHomepageText = await fetchWebsiteHomepageText(identity.website);

  const prompt = buildMasterIdentityProfilePrompt({
    aboutYou: identity.about_you,
    expertise: identity.expertise,
    website: identity.website,
    websiteHomepageText,
  });

  const rawProfile = await generateReview(prompt);
  const masterProfile = parseJsonResponse(rawProfile);

  if (websiteHomepageText?.trim()) {
    masterProfile.homepage_learning = websiteHomepageText.trim().slice(0, 4000);
  }

  const tenant = createTenantScope(organizationId);
  const { data, error } = await tenant
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

export async function upsertAthenaIdentity(
  input: UpsertAthenaIdentityInput,
): Promise<AthenaIdentity | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .upsert(
      {
        user_id: input.userId,
        organization_id: input.organizationId,
        greeting_name: input.greetingName ?? null,
        about_you: input.aboutYou ?? null,
        expertise: input.expertise ?? null,
        website: input.website ?? null,
        brain_status: "processing",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,organization_id" },
    )
    .select("*")
    .single();

  if (error) {
    console.error("Error saving Athena identity:", error);
    return null;
  }

  return compileMasterIdentityProfile(data, input.organizationId);
}
