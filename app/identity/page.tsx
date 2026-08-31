import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { redirect } from "next/navigation";
import { AiWorkspacePreferencesSection } from "@/components/identity/AiWorkspacePreferencesSection";
import { BrandIdentitySection } from "@/components/identity/BrandIdentitySection";
import { DeepScrapeWebsiteButton } from "@/components/identity/DeepScrapeWebsiteButton";
import { GetOblicLinksCard } from "@/components/identity/GetOblicLinksCard";
import { IdentityExecutiveIntelligence } from "@/components/identity/IdentityExecutiveIntelligence";
import {
  TrainAthenaForm,
  TrainAthenaSubmitButton,
} from "@/components/identity/TrainAthenaSubmitButton";
import { IdentityConversationPanel } from "@/components/identity/IdentityConversationPanel";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { getLocalizedBrainStatus } from "@/lib/tenantI18n/brainStatus";
import { tenantConversationWrapperChrome } from "@/lib/tenantI18n/conversationChrome";
import { formatTenantDateTime } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
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
import { organizationLanguageLabel } from "@/services/organizationLanguage";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { buildConversationScopeFingerprint } from "@/services/athenaConversation/athenaConversationScope";

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
    const code =
      error instanceof OrganizationBrandNotFoundError
        ? "not_found"
        : error instanceof Error
          ? error.message
          : "save_failed";
    redirect(`/identity?brandError=${encodeURIComponent(code)}`);
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
    redirect("/identity?workspaceError=invalid");
  }

  try {
    await updateOrganizationAiWorkspacePreferences({
      organizationId,
      preferredAiWorkspace,
      preferredImageGenerator,
    });
  } catch (error) {
    const code =
      error instanceof AiWorkspacePreferencesNotFoundError
        ? "not_found"
        : error instanceof Error
          ? error.message
          : "save_failed";
    redirect(`/identity?workspaceError=${encodeURIComponent(code)}`);
  }

  redirect("/identity?workspaceSaved=true");
}

function localizeFlashError(
  raw: string | undefined,
  known: Record<string, string>,
): string | null {
  if (!raw?.trim()) return null;
  const decoded = decodeURIComponent(raw);
  return known[decoded] ?? decoded;
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
  const { language, locale, messages } = await getTenantLocalization();
  const copy = messages.identity;
  const conversationChrome = tenantConversationWrapperChrome(messages);
  const identity = await getAthenaIdentityByUserId(userId, organizationId);
  const organizationBrand =
    await getOrganizationBrandIdentity(organizationId);
  const aiWorkspacePreferences =
    await getOrganizationAiWorkspacePreferences(organizationId);
  const accountLanguageLabel = organizationLanguageLabel(language);
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
  const brandError = localizeFlashError(params.brandError, {
    not_found: copy.flashBrandNotFound,
    save_failed: copy.flashBrandSaveFailed,
    "Organization not found.": copy.flashBrandNotFound,
    "Could not save brand identity.": copy.flashBrandSaveFailed,
  });
  const workspaceError = localizeFlashError(params.workspaceError, {
    invalid: copy.flashWorkspaceInvalid,
    not_found: copy.flashWorkspaceNotFound,
    save_failed: copy.flashWorkspaceSaveFailed,
    "Invalid AI workspace preferences.": copy.flashWorkspaceInvalid,
    "Organization not found.": copy.flashWorkspaceNotFound,
    "Could not save AI workspace preferences.": copy.flashWorkspaceSaveFailed,
  });

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/" label={copy.backToDashboard} />

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {copy.title}
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {copy.subtitle}
        </p>
      </div>

      {params.saved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {copy.flashSaved}
        </div>
      )}

      {params.brandSaved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {copy.flashBrandSaved}
        </div>
      )}

      <IdentityConversationPanel
        opaqueScope={buildConversationScopeFingerprint({
          scope: "identity",
          organizationId,
          userId,
        })}
        title={copy.conversationTitle}
        description={copy.conversationDescription}
        placeholder={copy.conversationPlaceholder}
        inputLabel={copy.conversationInputLabel}
        examplePrompts={[
          copy.example1,
          copy.example2,
          copy.example3,
          copy.example4,
          copy.example5,
          copy.example6,
        ]}
        chrome={conversationChrome.chrome}
        clearLabel={conversationChrome.clearLabel}
        submitLabel={conversationChrome.submitLabel}
        emptyStateTitle={conversationChrome.emptyStateTitle}
        readOnlyNotice={conversationChrome.readOnlyNotice}
      />

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <TrainAthenaForm
          action={saveIdentity}
          className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8"
        >
          <div className="grid gap-8">
            <label className="grid gap-3">
              <span className="text-xl font-semibold">{copy.greetingLabel}</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                {copy.greetingHelp}
              </span>
              <input
                name="greeting_name"
                defaultValue={identity?.greeting_name ?? ""}
                className={fieldClassName}
                placeholder={copy.greetingPlaceholder}
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">{copy.voiceLabel}</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                {copy.voiceHelp}
              </span>
              <textarea
                name="about_you"
                rows={8}
                defaultValue={identity?.about_you ?? ""}
                className={`resize-y leading-6 ${fieldClassName}`}
                placeholder={copy.voicePlaceholder}
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">
                {copy.knowledgeLabel}
              </span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                {copy.knowledgeHelp}
              </span>
              <textarea
                name="expertise"
                rows={10}
                defaultValue={identity?.expertise ?? ""}
                className={`resize-y leading-6 ${fieldClassName}`}
                placeholder={copy.knowledgePlaceholder}
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">{copy.websiteLabel}</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                {copy.websiteHelp}
              </span>
              <input
                name="website"
                defaultValue={identity?.website ?? ""}
                className={fieldClassName}
                placeholder={copy.websitePlaceholder}
              />
            </label>

            <TrainAthenaSubmitButton
              label={copy.trainAthena}
              pendingLabel={copy.trainingAthena}
            />
          </div>
        </TrainAthenaForm>

        <aside className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <h2 className="text-xl font-semibold">{copy.brainStatus}</h2>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/55">
            <div>
              {hasVoice ? "✓" : "○"} {copy.voiceLearned}
            </div>
            <div>
              {hasExpertise ? "✓" : "○"} {copy.expertiseLearned}
            </div>
            <div>
              {hasWebsite ? "✓" : "○"} {copy.homepageLearned}
            </div>
            <div>
              {hasMasterProfile ? "✓" : "○"} {copy.terminologyLearned}
            </div>
            <div>✓ {copy.continuousLearning}</div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.25em] text-white/35">
              {copy.accountLanguage}
            </div>
            <div className="mt-3 text-lg font-semibold text-white">
              {accountLanguageLabel}
            </div>
            <div className="mt-2 text-sm text-white/40">
              {copy.accountLanguageHelp}
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.25em] text-white/35">
              {copy.status}
            </div>
            <div className="mt-3 text-lg font-semibold text-[var(--athena-orange)]">
              {getLocalizedBrainStatus(messages, identity?.brain_status)}
            </div>
            <div className="mt-2 text-sm text-white/40">
              {copy.lastTrained}{" "}
              {identity?.brain_last_updated
                ? formatTenantDateTime(identity.brain_last_updated, language)
                : copy.notYetTrained}
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
            messages={copy.deepScrape}
            locale={locale}
          />

          <GetOblicLinksCard
            organizationId={organizationId}
            userId={userId}
            messages={copy.getoblic}
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
        messages={copy.brand}
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
        messages={copy.workspace}
      />

      <IdentityExecutiveIntelligence
        identity={identity}
        messages={copy}
        language={language}
      />
    </main>
  );
}
