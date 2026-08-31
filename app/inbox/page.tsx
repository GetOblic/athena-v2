import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { CaptureDiscussionForm } from "@/components/inbox/CaptureDiscussionForm";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getIntelligenceDomainName,
  getActiveIntelligenceDomains,
} from "@/services/intelligenceDomainService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function InboxPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ messages }, domains] = await Promise.all([
    getTenantLocalization(),
    getActiveIntelligenceDomains(organizationId),
  ]);
  const copy = messages.inbox;

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

      <CaptureDiscussionForm
        intelligenceDomains={domains.map((domain) => ({
          id: domain.id,
          name: getIntelligenceDomainName(domain),
        }))}
        messages={copy}
      />
    </main>
  );
}
