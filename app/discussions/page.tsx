import Link from "next/link";
import { getCommunities } from "@/services/communityService";
import { getDiscussions } from "@/services/discussionService";

function formatLastActivity(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DiscussionsPage() {
  const [discussions, communities] = await Promise.all([
    getDiscussions(),
    getCommunities(),
  ]);

  const communityById = new Map(communities.map((c) => [c.id, c]));

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <div className="mb-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Intelligence Feed
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Discussions
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Threads, questions and community conversations captured for Athena
          review.
        </p>
      </div>

      <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
        <div className="grid grid-cols-[1.2fr_2fr_auto_auto_auto_auto] border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35">
          <div>Community</div>
          <div>Title</div>
          <div>Score</div>
          <div>Status</div>
          <div>Last Activity</div>
          <div></div>
        </div>

        {discussions.length === 0 ? (
          <div className="p-10 text-center text-white/40">
            No discussions found.
          </div>
        ) : (
          discussions.map((discussion) => {
            const community = discussion.community_id
              ? communityById.get(discussion.community_id)
              : undefined;

            return (
              <div
                key={discussion.id}
                className="grid grid-cols-[1.2fr_2fr_auto_auto_auto_auto] items-center gap-4 border-b border-white/5 px-6 py-5 text-sm last:border-b-0"
              >
                <div className="text-white/50">
                  {community?.group_name ?? "—"}
                </div>

                <div className="font-medium text-white">{discussion.title}</div>

                <div className="text-2xl font-semibold text-[var(--athena-orange)]">
                  {discussion.opportunity_score}
                </div>

                <div className="text-[var(--athena-warning)]">
                  {discussion.status}
                </div>

                <div className="text-white/50">
                  {formatLastActivity(discussion.last_activity)}
                </div>

                <Link
                  href={`/discussions/${discussion.id}`}
                  className="shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                >
                  Analyze
                </Link>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
