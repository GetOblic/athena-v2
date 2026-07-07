import Link from "next/link";
import { FacebookInboxForm } from "@/components/inbox/FacebookInboxForm";
import {
  getIntelligenceDomainName,
  getActiveIntelligenceDomains,
} from "@/services/intelligenceDomainService";

export default async function InboxPage() {
  const domains = await getActiveIntelligenceDomains();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Inbox
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Capture Facebook Discussions
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Paste a Facebook group discussion once. An Intelligence Domain tells
          Athena which market, expertise, terminology and business context to use
          when analyzing a discussion.
        </p>
      </div>

      <FacebookInboxForm
        intelligenceDomains={domains.map((domain) => ({
          id: domain.id,
          name: getIntelligenceDomainName(domain),
        }))}
      />
    </main>
  );
}
