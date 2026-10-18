import { redirect } from "next/navigation";
import { Building2, MessageCircleQuestionMark, Palette } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { AiWorkspacePreferencesSection } from "@/components/identity/AiWorkspacePreferencesSection";
import { BrandIdentitySection } from "@/components/identity/BrandIdentitySection";
import {
  BusinessInformationSection,
  type BusinessInformationValues,
} from "@/components/identity/BusinessInformationSection";
import { DeepScrapeWebsiteButton } from "@/components/identity/DeepScrapeWebsiteButton";
import { GetOblicLinksCard } from "@/components/identity/GetOblicLinksCard";
import { IdentityAdvancedUnderstanding } from "@/components/identity/IdentityAdvancedUnderstanding";
import { IdentityCalibrationGaps } from "@/components/identity/IdentityCalibrationGaps";
import { IdentityConversationPanel } from "@/components/identity/IdentityConversationPanel";
import { identityAskUpgradeContent } from "@/lib/upgrade/freeAskUpgradePresentation";
import { IdentityOtherTools } from "@/components/identity/IdentityOtherTools";
import { IdentityKnowledgeScore } from "@/components/identity/IdentityKnowledgeScore";
import { IdentityInitialResearchStatus } from "@/components/identity/IdentityInitialResearchStatus";
import { IdentityPageHeader } from "@/components/identity/IdentityPageHeader";
import { IdentityTeachAthenaSection } from "@/components/identity/IdentityTeachAthenaSection";
import { IdentityWebsiteKnowledge } from "@/components/identity/IdentityWebsiteKnowledge";
import { IdentityWhatAthenaKnows } from "@/components/identity/IdentityWhatAthenaKnows";
import {
  hasSuccessfulAthenaTraining,
  IDENTITY_CARD_ICON_CLASS,
  IDENTITY_CARD_SURFACE_CLASS,
  IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS,
} from "@/components/identity/identityPagePresentation";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { serializeInitialResearchStatus } from "@/lib/websiteLearning/initialResearchProgress";
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
import { computeIdentityKnowledgeScore } from "@/services/identity/identityKnowledgeScore";
import {
  getAthenaIdentityByUserId,
  upsertAthenaIdentity,
} from "@/services/identity/identityService";
import { organizationLanguageLabel } from "@/services/organizationLanguage";
import {
  FreeIdentityGenerationError,
  isFreeIdentityGenerationLocked,
} from "@/lib/organization/freeIdentityGeneration";
import { assertCurrentFreeIdentityGeneration } from "@/services/organization/freeIdentityGenerationGuard";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";
import { loadFreeIdentityAskAuthority } from "@/services/organization/freeIdentityAskAuthority";
import { readSubmittedCommercialField } from "@/services/organization/commercialIdentity";
import {
  commercialIdentitySaveErrorCode,
  getOrganizationCommercialIdentity,
  updateOrganizationCommercialIdentity,
} from "@/services/organization/organizationCommercialIdentity";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import {
  getActiveDeepScrapeJobForBrain,
  getLatestDeepScrapeJobForBrain,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import {
  emptyFreeIdentityAskState,
  resolveFreeIdentityAskPresentation,
} from "@/lib/organization/freeIdentityAsk";

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

  try {
    await assertCurrentFreeIdentityGeneration();
  } catch (error) {
    if (error instanceof FreeIdentityGenerationError) {
      redirect("/identity");
    }
    throw error;
  }

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

async function saveBusinessInformation(formData: FormData) {
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
    await updateOrganizationCommercialIdentity({
      organizationId,
      legal_name: readSubmittedCommercialField(formData, "legal_name"),
      address: readSubmittedCommercialField(formData, "address"),
      address_line2: readSubmittedCommercialField(formData, "address_line2"),
      city: readSubmittedCommercialField(formData, "city"),
      state: readSubmittedCommercialField(formData, "state"),
      postal_code: readSubmittedCommercialField(formData, "postal_code"),
      country: readSubmittedCommercialField(formData, "country"),
      phone: readSubmittedCommercialField(formData, "phone"),
      business_email: readSubmittedCommercialField(formData, "business_email"),
      decision_maker: readSubmittedCommercialField(formData, "decision_maker"),
      job_title: readSubmittedCommercialField(formData, "job_title"),
      registration_number: readSubmittedCommercialField(
        formData,
        "registration_number",
      ),
      tax_identifier: readSubmittedCommercialField(formData, "tax_identifier"),
      tax_identifier_label: readSubmittedCommercialField(
        formData,
        "tax_identifier_label",
      ),
      whatsapp_number: readSubmittedCommercialField(formData, "whatsapp_number"),
      facebook: readSubmittedCommercialField(formData, "facebook"),
      instagram: readSubmittedCommercialField(formData, "instagram"),
      linkedin: readSubmittedCommercialField(formData, "linkedin"),
      google_business_url: readSubmittedCommercialField(
        formData,
        "google_business_url",
      ),
      category: readSubmittedCommercialField(formData, "category"),
      industry: readSubmittedCommercialField(formData, "industry"),
      timezone: readSubmittedCommercialField(formData, "timezone"),
    });
  } catch (error) {
    const code = commercialIdentitySaveErrorCode(error);
    redirect(`/identity?businessError=${encodeURIComponent(code)}`);
  }

  redirect("/identity?businessSaved=true");
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
    businessSaved?: string;
    businessError?: string;
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
  const [{ language, locale, messages }, freeProgression] = await Promise.all([
    getTenantLocalization(),
    loadFreeProgressionState(),
  ]);
  const copy = messages.identity;
  const conversationChrome = tenantConversationWrapperChrome(messages);
  const identity = await getAthenaIdentityByUserId(userId, organizationId);
  const activeInitialResearch = identity
    ? await getActiveDeepScrapeJobForBrain({
        identityId: identity.id,
        organizationId,
      })
    : null;
  const latestInitialResearch = activeInitialResearch
    ? activeInitialResearch
    : identity
      ? await getLatestDeepScrapeJobForBrain({
          identityId: identity.id,
          organizationId,
        })
      : null;
  const initialResearch = serializeInitialResearchStatus(latestInitialResearch);
  const organizationBrand =
    await getOrganizationBrandIdentity(organizationId);
  const organizationCommercial =
    await getOrganizationCommercialIdentity(organizationId);
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
  const identityGenerationLocked = isFreeIdentityGenerationLocked({
    athenaPlan: freeProgression.athenaPlan,
    trained,
  });
  const askAuthority =
    freeProgression.athenaPlan === "free"
      ? await loadFreeIdentityAskAuthority(organizationId)
      : emptyFreeIdentityAskState();
  const askPresentation = resolveFreeIdentityAskPresentation({
    athenaPlan: freeProgression.athenaPlan,
    trained,
    consumedCount: askAuthority.consumedCount,
  });
  const executive = readIdentityExecutiveIntelligence(identity?.master_profile);
  const knowledge = computeIdentityKnowledgeScore({
    identity,
    brand: organizationBrand,
  });
  const trainLabel = trained ? copy.retrainAthena : copy.trainAthena;
  const trainPendingLabel = trained
    ? copy.retrainingAthena
    : copy.trainingAthena;
  const businessError = localizeFlashError(params.businessError, {
    not_found: copy.flashBusinessNotFound,
    save_failed: copy.flashBusinessSaveFailed,
    "Organization not found.": copy.flashBusinessNotFound,
    "Could not save business information.": copy.flashBusinessSaveFailed,
  });
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
      trainLabel={trainLabel}
      pendingLabel={trainPendingLabel}
      generationLocked={identityGenerationLocked}
    />
  );

  const businessValues = {
    legal_name: organizationCommercial?.legal_name ?? "",
    address: organizationCommercial?.address ?? "",
    address_line2: organizationCommercial?.address_line2 ?? "",
    city: organizationCommercial?.city ?? "",
    state: organizationCommercial?.state ?? "",
    postal_code: organizationCommercial?.postal_code ?? "",
    country: organizationCommercial?.country ?? "",
    phone: organizationCommercial?.phone ?? "",
    business_email: organizationCommercial?.business_email ?? "",
    decision_maker: organizationCommercial?.decision_maker ?? "",
    job_title: organizationCommercial?.job_title ?? "",
    registration_number: organizationCommercial?.registration_number ?? "",
    tax_identifier: organizationCommercial?.tax_identifier ?? "",
    tax_identifier_label: organizationCommercial?.tax_identifier_label ?? "",
    whatsapp_number: organizationCommercial?.whatsapp_number ?? "",
    facebook: organizationCommercial?.facebook ?? "",
    instagram: organizationCommercial?.instagram ?? "",
    linkedin: organizationCommercial?.linkedin ?? "",
    google_business_url: organizationCommercial?.google_business_url ?? "",
    category: organizationCommercial?.category ?? "",
    industry: organizationCommercial?.industry ?? "",
    timezone: organizationCommercial?.timezone ?? "",
  } satisfies BusinessInformationValues;

  const businessInformation = (
    <AthenaCollapsibleSection
      key={businessError ?? "business-information"}
      title={copy.business.title}
      summary={copy.business.description}
      defaultOpen={Boolean(businessError)}
      tone="identity"
      icon={<Building2 size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.blue}
      className={IDENTITY_CARD_SURFACE_CLASS.blue}
    >
      <BusinessInformationSection
        key={[
          organizationId,
          organizationCommercial?.name ?? "",
          ...Object.values(businessValues),
        ].join("|")}
        tradingName={organizationCommercial?.name ?? ""}
        initialValues={businessValues}
        saveBusinessInformation={saveBusinessInformation}
        error={businessError}
        messages={copy.business}
      />
    </AthenaCollapsibleSection>
  );

  const brandIdentity = (
    <AthenaCollapsibleSection
      title={copy.brand.title}
      summary={copy.brand.description}
      defaultOpen={false}
      tone="identity"
      icon={<Palette size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.green}
      className={IDENTITY_SUCCESS_SECTION_CONTOUR_CLASS}
    >
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
      tone="identity"
      icon={<MessageCircleQuestionMark size={20} />}
      iconClassName={IDENTITY_CARD_ICON_CLASS.violet}
      className={IDENTITY_CARD_SURFACE_CLASS.violet}
    >
      <IdentityConversationPanel
        opaqueScope={buildConversationScopeFingerprint({
          scope: "identity",
          organizationId,
          userId,
        })}
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
        presentation={askPresentation}
        askCopy={{
          untrainedTitle: copy.page.askAthenaUntrainedTitle,
          untrainedHelper: copy.page.askAthenaUntrainedHelper,
          untrainedActionLabel: copy.page.askAthenaUntrainedAction,
          exhaustedTitle: copy.page.askAthenaExhaustedTitle,
          exhaustedHelper: copy.page.askAthenaExhaustedHelper,
        }}
        upgradeContent={identityAskUpgradeContent({
          continuation: copy.page.askAthenaContinuation,
          upgrade: messages.upgrade,
        })}
      />
    </AthenaCollapsibleSection>
  );

  const deepScrape = identityGenerationLocked ? null : (
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
      variant="compact"
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
          language={language}
        />
      }
    />
  );

  return (
    <TenantAppShell
      currentPath="/identity"
      messages={messages}
      {...freeProgression}
    >
      <IdentityPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        statusLabel={copy.status}
        statusValue={
          <IdentityInitialResearchStatus
            initial={{
              brainStatus: identity?.brain_status ?? "pending",
              research: initialResearch,
            }}
            labels={{
              ready: messages.identity.brainStatusValues.ready,
              pending: messages.identity.brainStatusValues.pending,
              processing: messages.identity.brainStatusValues.processing,
            }}
            copy={copy.initialResearch}
          />
        }
        lastTrainedLabel={copy.lastTrained}
        lastTrainedValue={
          identity?.brain_last_updated
            ? formatTenantDateTime(identity.brain_last_updated, language)
            : copy.notYetTrained
        }
        knowledgeScore={
          <IdentityKnowledgeScore score={knowledge.score} messages={copy} />
        }
      />

      {params.saved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {copy.flashSaved}
        </div>
      )}

      {params.businessSaved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {copy.flashBusinessSaved}
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
            {askAthena}
            {teachAthena}
            {businessInformation}
            {brandIdentity}
            {otherTools}
            {executive ? (
              <IdentityAdvancedUnderstanding
                executive={executive}
                messages={copy}
              />
            ) : null}
            <IdentityWebsiteKnowledge
              identity={identity}
              messages={copy}
              language={language}
              trained={trained}
              deepScrape={deepScrape}
              generationLocked={identityGenerationLocked}
            />
          </>
        ) : (
          <>
            {askAthena}
            {teachAthena}
            {businessInformation}
            {brandIdentity}
            {otherTools}
            <IdentityWebsiteKnowledge
              identity={identity}
              messages={copy}
              language={language}
              trained={trained}
              deepScrape={deepScrape}
              generationLocked={identityGenerationLocked}
            />
          </>
        )}
      </div>
    </TenantAppShell>
  );
}
