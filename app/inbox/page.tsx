import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { CaptureDiscussionForm } from "@/components/inbox/CaptureDiscussionForm";
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
    <TenantAppShell currentPath="/inbox" messages={messages}>
      <div className="mb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {copy.eyebrow}
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
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
    </TenantAppShell>
  );
}
