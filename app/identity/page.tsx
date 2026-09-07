import { redirect } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { AiWorkspacePreferencesSection } from "@/components/identity/AiWorkspacePreferencesSection";
import { BrandIdentitySection } from "@/components/identity/BrandIdentitySection";
import { DeepScrapeWebsiteButton } from "@/components/identity/DeepScrapeWebsiteButton";
import { GetOblicLinksCard } from "@/components/identity/GetOblicLinksCard";
import { IdentityAdvancedUnderstanding } from "@/components/identity/IdentityAdvancedUnderstanding";
import { IdentityCalibrationGaps } from "@/components/identity/IdentityCalibrationGaps";
import { IdentityConversationPanel } from "@/components/identity/IdentityConversationPanel";
import { IdentityOtherTools } from "@/components/identity/IdentityOtherTools";
import { IdentityPageHeader } from "@/components/identity/IdentityPageHeader";
import { IdentityTeachAthenaSection } from "@/components/identity/IdentityTeachAthenaSection";
import { IdentityWebsiteKnowledge } from "@/components/identity/IdentityWebsiteKnowledge";
import { IdentityWhatAthenaKnows } from "@/components/identity/IdentityWhatAthenaKnows";
import {
  hasMaterialCalibrationGaps,
  hasSuccessfulAthenaTraining,
  isAthenaBrainTraining,
  shouldOpenTeachAthena,
} from "@/components/identity/identityPagePresentation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { getLocalizedBrainStatus } from "@/lib/tenantI18n/brainStatus";
import { tenantConversationWrapperChrome } from "@/lib/tenantI18n/conversationChrome";
import { formatTenantDateTime } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isAiWorkspaceId,
  isImageGeneratorId,
} from "@/services/assetContinuation/destinationRegistry";
import { buildConversationScopeFingerprint } from "@/services/athenaConversation/athenaConversationScope";
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
import { readIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import {
  getAthenaIdentityByUserId,
  upsertAthenaIdentity,
} from "@/services/identity/identityService";
import { organizationLanguageLabel } from "@/services/organizationLanguage";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

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

  const hasWebsite = Boolean(identity?.website?.trim());
  const trained = hasSuccessfulAthenaTraining(identity);
  const training = isAthenaBrainTraining(identity);
  const executive = readIdentityExecutiveIntelligence(identity?.master_profile);
  const teachAthenaOpen = shouldOpenTeachAthena({
    trained,
    training,
    hasCalibrationGaps: hasMaterialCalibrationGaps(executive?.calibration_gaps),
  });
  const trainLabel = trained ? copy.retrainAthena : copy.trainAthena;
  const trainPendingLabel = trained
    ? copy.retrainingAthena
    : copy.trainingAthena;
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

  const teachAthena = (
    <IdentityTeachAthenaSection
      identity={identity}
      messages={copy}
      action={saveIdentity}
      defaultOpen={teachAthenaOpen}
      trainLabel={trainLabel}
      pendingLabel={trainPendingLabel}
    />
  );

  const brandIdentity = (
    <AthenaCollapsibleSection title={copy.brand.title} defaultOpen={false}>
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
    </AthenaCollapsibleSection>
  );

  const askAthena = (
    <AthenaCollapsibleSection
      title={copy.conversationTitle}
      summary={copy.page.askAthenaSummary}
      defaultOpen={false}
    >
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
    </AthenaCollapsibleSection>
  );

  const deepScrape = (
    <DeepScrapeWebsiteButton
      initiallyAvailable={identity?.brain_status === "ready" && hasWebsite}
      initialLastDeepScrapeAt={identity?.last_deep_scrape_at ?? null}
      initialLastDeepScrapePages={
        typeof identity?.last_deep_scrape_pages === "number"
          ? identity.last_deep_scrape_pages
          : null
      }
      messages={copy.deepScrape}
      locale={locale}
    />
  );

  const otherTools = (
    <IdentityOtherTools
      messages={copy}
      accountLanguageLabel={accountLanguageLabel}
      workspace={
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
      }
      getoblic={
        <GetOblicLinksCard
          organizationId={organizationId}
          userId={userId}
          messages={copy.getoblic}
        />
      }
    />
  );

  return (
    <TenantAppShell currentPath="/identity" messages={messages}>
      <IdentityPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        statusLabel={copy.status}
        statusValue={getLocalizedBrainStatus(messages, identity?.brain_status)}
        lastTrainedLabel={copy.lastTrained}
        lastTrainedValue={
          identity?.brain_last_updated
            ? formatTenantDateTime(identity.brain_last_updated, language)
            : copy.notYetTrained
        }
      />

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

      <div className="grid gap-8">
        {trained ? (
          <>
            <IdentityWhatAthenaKnows identity={identity} messages={copy} />
            {executive ? (
              <IdentityCalibrationGaps
                gaps={executive.calibration_gaps}
                messages={copy}
              />
            ) : null}
            {teachAthena}
            <IdentityWebsiteKnowledge
              identity={identity}
              messages={copy}
              language={language}
              trained={trained}
              deepScrape={deepScrape}
            />
            {brandIdentity}
            {askAthena}
            {executive ? (
              <IdentityAdvancedUnderstanding
                executive={executive}
                messages={copy}
              />
            ) : null}
            {otherTools}
          </>
        ) : (
          <>
            {teachAthena}
            {brandIdentity}
            {askAthena}
            {otherTools}
          </>
        )}
      </div>
    </TenantAppShell>
  );
}
