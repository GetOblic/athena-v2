export const dynamic = "force-dynamic";

import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { ProspectsLibraryClient } from "@/components/prospects/ProspectsLibraryClient";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { enrichProspectsForLibrary } from "@/services/prospects/prospectLibraryEnrichment";
import { getProspects } from "@/services/prospects/prospectService";

export default async function ProspectsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const { language, messages } = await getTenantLocalization();
  const copy = messages.prospects;
  const prospects = await enrichProspectsForLibrary(
    await getProspects(organizationId),
    organizationId,
  );

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

      <ProspectsLibraryClient
        prospects={prospects}
        messages={messages}
        language={language}
      />
    </main>
  );
}
