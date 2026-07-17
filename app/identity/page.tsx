import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { redirect } from "next/navigation";
import { AiWorkspacePreferencesSection } from "@/components/identity/AiWorkspacePreferencesSection";
import { BrandIdentitySection } from "@/components/identity/BrandIdentitySection";
import { DeepScrapeWebsiteButton } from "@/components/identity/DeepScrapeWebsiteButton";
import { IdentityExecutiveIntelligence } from "@/components/identity/IdentityExecutiveIntelligence";
import {
  TrainAthenaForm,
  TrainAthenaSubmitButton,
} from "@/components/identity/TrainAthenaSubmitButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isAiWorkspaceId,
  isImageGeneratorId,
} from "@/services/assetContinuation/destinationRegistry";
import {
  AiWorkspacePreferencesNotFoundError,
  getOrganizationAiWorkspacePreferences,
  updateOrganizationAiWorkspacePreferences,
} from "@/services/identity/aiWorkspacePreferences";
import {
  getOrganizationBrandIdentity,
  OrganizationBrandNotFoundError,
  resolveOrganizationBrandLogoPreviewUrl,
  resolveOrganizationBrandProfilePicturePreviewUrl,
  updateOrganizationBrandIdentity,
} from "@/services/identity/brandIdentityService";
import {
  getAthenaIdentityByUserId,
  upsertAthenaIdentity,
} from "@/services/identity/identityService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

async function saveIdentity(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId } = await requireCurrentOrganizationContext();

  await upsertAthenaIdentity({
    userId: user.id,
    organizationId,
    greetingName: String(formData.get("greeting_name") ?? ""),
    aboutYou: String(formData.get("about_you") ?? ""),
    expertise: String(formData.get("expertise") ?? ""),
    website: String(formData.get("website") ?? ""),
  });

  redirect("/identity?saved=true");
}

async function saveBrandIdentity(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId } = await requireCurrentOrganizationContext();

  try {
    await updateOrganizationBrandIdentity({
      organizationId,
      primaryColor: String(formData.get("brand_primary_color") ?? ""),
      secondaryColor: String(formData.get("brand_secondary_color") ?? ""),
      accentColor: String(formData.get("brand_accent_color") ?? ""),
      backgroundColor: String(formData.get("brand_background_color") ?? ""),
      font: String(formData.get("brand_font") ?? ""),
    });
  } catch (error) {
    const message =
      error instanceof OrganizationBrandNotFoundError
        ? "Organization not found."
        : error instanceof Error
          ? error.message
          : "Could not save brand identity.";
    redirect(`/identity?brandError=${encodeURIComponent(message)}`);
  }

  redirect("/identity?brandSaved=true");
}

async function saveAiWorkspacePreferences(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId } = await requireCurrentOrganizationContext();
  const preferredAiWorkspace = String(
    formData.get("preferred_ai_workspace") ?? "",
  );
  const preferredImageGenerator = String(
    formData.get("preferred_image_generator") ?? "",
  );

  if (
    !isAiWorkspaceId(preferredAiWorkspace) ||
    !isImageGeneratorId(preferredImageGenerator)
  ) {
    redirect(
      `/identity?workspaceError=${encodeURIComponent("Invalid AI workspace preferences.")}`,
    );
  }

  try {
    await updateOrganizationAiWorkspacePreferences({
      organizationId,
      preferredAiWorkspace,
      preferredImageGenerator,
    });
  } catch (error) {
    const message =
      error instanceof AiWorkspacePreferencesNotFoundError
        ? "Organization not found."
        : error instanceof Error
          ? error.message
          : "Could not save AI workspace preferences.";
    redirect(`/identity?workspaceError=${encodeURIComponent(message)}`);
  }

  redirect("/identity?workspaceSaved=true");
}

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    brandSaved?: string;
    brandError?: string;
    workspaceSaved?: string;
    workspaceError?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const { organizationId, userId } = await requireCurrentOrganizationContext();
  const identity = await getAthenaIdentityByUserId(userId, organizationId);
  const organizationBrand =
    await getOrganizationBrandIdentity(organizationId);
  const aiWorkspacePreferences =
    await getOrganizationAiWorkspacePreferences(organizationId);
  const logoPreviewUrl = await resolveOrganizationBrandLogoPreviewUrl(
    organizationBrand,
    organizationId,
  );
  const profilePicturePreviewUrl =
    await resolveOrganizationBrandProfilePicturePreviewUrl(
      organizationBrand,
      organizationId,
    );

  const hasVoice = Boolean(identity?.about_you?.trim());
  const hasExpertise = Boolean(identity?.expertise?.trim());
  const hasWebsite = Boolean(identity?.website?.trim());
  const hasMasterProfile = Boolean(identity?.master_profile);
  const brandError = params.brandError?.trim()
    ? decodeURIComponent(params.brandError)
    : null;
  const workspaceError = params.workspaceError?.trim()
    ? decodeURIComponent(params.workspaceError)
    : null;

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Brain
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Train Your Athena Brain
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Teach Athena your voice, expertise, business knowledge and professional
          rules. Athena will use this when generating replies, CTAs, briefings
          and strategic asset blueprints.
        </p>
      </div>

      {params.saved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          Athena Brain trained successfully.
        </div>
      )}

      {params.brandSaved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          Brand Identity saved successfully.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <TrainAthenaForm
          action={saveIdentity}
          className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8"
        >
          <div className="grid gap-8">
            <label className="grid gap-3">
              <span className="text-xl font-semibold">
                What should Athena call you?
              </span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                This name is used across your dashboard experience. Examples:
                Laurent, Liana, Dr. Smith, Coach Sarah.
              </span>
              <input
                name="greeting_name"
                defaultValue={identity?.greeting_name ?? ""}
                className={fieldClassName}
                placeholder="Liana"
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Your Voice</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Help Athena understand how you naturally communicate. Example:
                &ldquo;I&apos;m a PMU educator with 12 years of experience. I believe
                education should come before selling. My communication style is
                warm, reassuring and professional.&rdquo;
              </span>
              <textarea
                name="about_you"
                rows={8}
                defaultValue={identity?.about_you ?? ""}
                className={`resize-y leading-6 ${fieldClassName}`}
                placeholder="Tell Athena how you think, speak, teach and guide people..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">
                Your Business Knowledge
              </span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Teach Athena your expertise, methodology, terminology and
                professional rules. Example: &ldquo;My training follows a five-step
                methodology: consultation, theory, hands-on practice,
                supervised work and business launch.&rdquo;
              </span>
              <textarea
                name="expertise"
                rows={10}
                defaultValue={identity?.expertise ?? ""}
                className={`resize-y leading-6 ${fieldClassName}`}
                placeholder="Teach Athena your methodology, frameworks, FAQs, terminology, offers and rules..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Business Website</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Athena studies your homepage during Train Athena. After training,
                use Deep Scrape Website for autonomous multi-page learning.
              </span>
              <input
                name="website"
                defaultValue={identity?.website ?? ""}
                className={fieldClassName}
                placeholder="https://yourcompany.com"
              />
            </label>

            <TrainAthenaSubmitButton />
          </div>
        </TrainAthenaForm>

        <aside className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <h2 className="text-xl font-semibold">Brain Status</h2>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/55">
            <div>{hasVoice ? "✓" : "○"} Voice learned</div>
            <div>{hasExpertise ? "✓" : "○"} Expertise learned</div>
            <div>{hasWebsite ? "✓" : "○"} Homepage learned</div>
            <div>{hasMasterProfile ? "✓" : "○"} Professional terminology learned</div>
            <div>✓ Continuous learning enabled</div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.25em] text-white/35">
              Status
            </div>
            <div className="mt-3 text-lg font-semibold text-[var(--athena-orange)]">
              {identity?.brain_status ?? "pending"}
            </div>
            <div className="mt-2 text-sm text-white/40">
              Last trained:{" "}
              {identity?.brain_last_updated
                ? new Date(identity.brain_last_updated).toLocaleString()
                : "Not yet trained"}
            </div>
          </div>

          <DeepScrapeWebsiteButton
            initiallyAvailable={
              identity?.brain_status === "ready" && hasWebsite
            }
            initialLastDeepScrapeAt={identity?.last_deep_scrape_at ?? null}
            initialLastDeepScrapePages={
              typeof identity?.last_deep_scrape_pages === "number"
                ? identity.last_deep_scrape_pages
                : null
            }
          />
        </aside>
      </div>

      <BrandIdentitySection
        key={[
          organizationId,
          organizationBrand?.brand_logo_storage_path ?? "",
          organizationBrand?.brand_profile_picture_storage_path ?? "",
          organizationBrand?.brand_primary_color ?? "",
          organizationBrand?.brand_secondary_color ?? "",
          organizationBrand?.brand_accent_color ?? "",
          organizationBrand?.brand_background_color ?? "",
          organizationBrand?.brand_font ?? "",
        ].join("|")}
        initialPrimaryColor={organizationBrand?.brand_primary_color ?? ""}
        initialSecondaryColor={organizationBrand?.brand_secondary_color ?? ""}
        initialAccentColor={organizationBrand?.brand_accent_color ?? ""}
        initialBackgroundColor={
          organizationBrand?.brand_background_color ?? ""
        }
        initialFont={organizationBrand?.brand_font ?? ""}
        initialLogoPreviewUrl={logoPreviewUrl}
        initialProfilePicturePreviewUrl={profilePicturePreviewUrl}
        saveBrandIdentity={saveBrandIdentity}
        brandError={brandError}
      />

      <AiWorkspacePreferencesSection
        initialPreferredAiWorkspace={
          aiWorkspacePreferences.preferredAiWorkspace
        }
        initialPreferredImageGenerator={
          aiWorkspacePreferences.preferredImageGenerator
        }
        saveAiWorkspacePreferences={saveAiWorkspacePreferences}
        saved={params.workspaceSaved === "true"}
        error={workspaceError}
      />

      <IdentityExecutiveIntelligence identity={identity} />
    </main>
  );
}
