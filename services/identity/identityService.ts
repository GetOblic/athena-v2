import { generateReview } from "@/services/aiService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertTenantRecord, createTenantScope } from "@/lib/tenantDatabase";
import {
  hasUsableStoredHomepageLearning,
  readStoredHomepageLearning,
  resolveIdentityWebsiteHomepageText,
} from "@/services/identity/identityHomepageLearning";
import { attachIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import {
  buildMasterIdentityProfilePrompt,
  MASTER_IDENTITY_PROFILE_PROMPT_VERSION,
} from "@/services/identity/prompts/masterIdentityProfilePrompt";
import { logWebsiteLearning } from "@/services/websiteLearning/websiteLearningObservability";
import {
  deepIntelligenceHasUsableContent,
  formatDeepIntelligenceForBrainPrompt,
  isDeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

export {
  hasUsableStoredHomepageLearning,
  readStoredHomepageLearning,
  resolveIdentityWebsiteHomepageText,
} from "@/services/identity/identityHomepageLearning";
export {
  readIdentityExecutiveIntelligence,
  buildIdentityWebsiteCoverageView,
  formatIdentityConfidenceLabel,
} from "@/services/identity/identityExecutiveIntelligence";

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
  website_intelligence?: Record<string, unknown> | null;
  last_deep_scrape_at?: string | null;
  last_deep_scrape_pages?: number | null;
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

export async function getAthenaIdentityById(
  identityId: string,
  organizationId: string,
): Promise<AthenaIdentity | null> {
  const tenant = createTenantScope(organizationId);
  const { data, error } = await tenant
    .from("athena_identity")
    .select("*")
    .eq("id", identityId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching Athena identity by id:", error);
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

  const deepIntelligence = isDeepWebsiteIntelligence(identity.website_intelligence)
    ? identity.website_intelligence
    : null;
  const hasDeepIntelligence = deepIntelligenceHasUsableContent(deepIntelligence);

  const hasStoredHomepageLearning = hasUsableStoredHomepageLearning(
    identity.master_profile,
  );
  logWebsiteLearning({
    source: "identity",
    organizationId,
    decision: hasDeepIntelligence
      ? "reuse"
      : hasStoredHomepageLearning
        ? "reuse"
        : "scrape",
    reason: hasDeepIntelligence
      ? "stored_deep_website_intelligence_present"
      : hasStoredHomepageLearning
        ? "stored_homepage_learning_present"
        : "missing_homepage_learning",
    hasStoredHomepageLearning,
  });

  let websiteHomepageText: string | null = null;
  let scraped = false;
  const storedHomepageLearning = readStoredHomepageLearning(
    identity.master_profile,
  );

  if (hasDeepIntelligence && deepIntelligence) {
    websiteHomepageText = formatDeepIntelligenceForBrainPrompt(deepIntelligence);
  } else {
    const resolvedHomepage = await resolveIdentityWebsiteHomepageText({
      masterProfile: identity.master_profile,
      website: identity.website,
      fetchHomepageText: fetchWebsiteHomepageText,
    });
    websiteHomepageText = resolvedHomepage.text;
    scraped = resolvedHomepage.scraped;
  }

  if (scraped) {
    const scrapedStored = Boolean(websiteHomepageText?.trim());
    logWebsiteLearning({
      source: "identity",
      organizationId,
      event: "scrape_completed",
      stored: scrapedStored,
    });
  }

  const prompt = buildMasterIdentityProfilePrompt({
    aboutYou: identity.about_you,
    expertise: identity.expertise,
    website: identity.website,
    websiteHomepageText,
    usesDeepWebsiteIntelligence: hasDeepIntelligence,
  });

  const previousMasterProfile =
    identity.master_profile && typeof identity.master_profile === "object"
      ? identity.master_profile
      : null;

  let masterProfile: Record<string, unknown>;
  try {
    const rawProfile = await generateReview(prompt, {
      stage: "identity.master_profile",
      promptSource: "services/identity/identityService.ts",
      generationKind: "identity_profile",
    });
    masterProfile = parseJsonResponse(rawProfile);
  } catch (error) {
    // Preserve the last successful master_profile (including Executive Intelligence).
    console.error("Error compiling master identity profile:", error);
    return identity;
  }

  if (storedHomepageLearning) {
    // Preserve exact stored homepage learning across identity updates.
    masterProfile.homepage_learning = storedHomepageLearning;
  } else if (websiteHomepageText?.trim()) {
    masterProfile.homepage_learning = websiteHomepageText.trim().slice(0, 4000);
  }

  const attached = attachIdentityExecutiveIntelligence({
    masterProfile,
    previousMasterProfile,
  });
  masterProfile = attached.masterProfile;

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
