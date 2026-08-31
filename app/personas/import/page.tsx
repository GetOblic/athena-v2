import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { PersonaImportForms } from "@/components/personas/PersonaImportForms";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function PersonaImportPage() {
  await requireCurrentOrganizationContext();
  const { messages } = await getTenantLocalization();
  const copy = messages.personas;

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />

      <TenantBackLink href="/personas" label={copy.backToPersonas} />

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          {copy.list.createCta}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          {copy.import.subtitle}
        </p>
      </div>

      <PersonaImportForms messages={messages} />
    </main>
  );
}
