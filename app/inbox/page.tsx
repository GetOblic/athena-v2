import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { CaptureDiscussionForm } from "@/components/inbox/CaptureDiscussionForm";
import {
  getIntelligenceDomainName,
  getActiveIntelligenceDomains,
} from "@/services/intelligenceDomainService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function InboxPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const domains = await getActiveIntelligenceDomains(organizationId);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Inbox
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Capture Discussion
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Paste a discussion from any source. Athena will normalize the
          conversation, understand its context, and generate market intelligence,
          opportunities, executive briefings and reusable assets.
        </p>
      </div>

      <CaptureDiscussionForm
        intelligenceDomains={domains.map((domain) => ({
          id: domain.id,
          name: getIntelligenceDomainName(domain),
        }))}
      />
    </main>
  );
}
