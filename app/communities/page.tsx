import Link from "next/link";
import { getCommunities } from "@/services/communityService";

export default async function CommunitiesPage() {
  const communities = await getCommunities();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <div className="mb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Community Intelligence
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Communities
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Communities continuously monitored by Athena for market intelligence,
          opportunity detection and executive briefing generation.
        </p>
      </div>

      <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
        <div className="grid grid-cols-6 border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35">
          <div>Platform</div>
          <div className="col-span-2">Community</div>
          <div>Status</div>
          <div>Priority</div>
          <div>Owner</div>
        </div>

        {communities.length === 0 ? (
          <div className="p-10 text-center text-white/40">
            No communities found.
          </div>
        ) : (
          communities.map((community) => (
            <div
              key={community.id}
              className="grid grid-cols-6 border-b border-white/5 px-6 py-5 text-sm last:border-b-0"
            >
              <div className="text-white/70">{community.platform}</div>

              <Link
                href={`/communities/${community.id}`}
                className="col-span-2 font-medium text-white transition hover:text-[var(--athena-orange)]"
              >
                {community.group_name}
              </Link>

              <div className="text-[var(--athena-success)]">
                {community.status}
              </div>

              <div>{community.priority}</div>

              <div className="text-white/50">{community.owner}</div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}