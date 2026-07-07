import Link from "next/link";
import { FacebookInboxForm } from "@/components/inbox/FacebookInboxForm";
import { getCommunities } from "@/services/communityService";

export default async function InboxPage() {
  const communities = await getCommunities();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Inbox
        </div>

        <h1 className="mt-4 text-5xl font-semibold trackg-tight">
          Capture Facebook Discussions
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Paste a Facebook group discussion once. Athena normalizes it into the
          discussion pipeline so analysis, opportunities, briefings and learning
          can happen downstream.
        </p>
      </div>

      <FacebookInboxForm
        communities={communities.map((community) => ({
          id: community.id,
          group_name: community.group_name,
        }))}
      />
    </main>
  );
}
