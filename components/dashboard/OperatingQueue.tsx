import Link from "next/link";
import { getHighPriorityDiscussions } from "@/services/discussionService";

export async function OperatingQueue() {
    const discussions = await getHighPriorityDiscussions(5);

    return (
        <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 lg:col-span-2">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Priority Queue</h2>

                <span className="rounded-full border border-[var(--athena-orange)]/40 px-4 py-2 text-xs text-[var(--athena-orange)]">
                    {discussions.length} active item{discussions.length === 1 ? "" : "s"}
                </span>
            </div>

            {discussions.length === 0 ? (
                <div className="mt-10 rounded-[22px] border border-dashed border-white/10 p-14 text-center">
                    <div className="text-2xl font-semibold">
                        No priority discussions yet.
                    </div>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
                        Athena will surface high-opportunity discussions here once they are
                        captured.
                    </p>
                </div>
            ) : (
                <div className="mt-8 space-y-4">
                    {discussions.map((discussion) => (
                        <div
                            key={discussion.id}
                            className="rounded-[18px] border border-white/10 bg-black/20 p-5"
                        >
                            <div className="flex items-start justify-between gap-6">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.25em] text-white/35">
                                        {discussion.platform} · {discussion.status}
                                    </div>

                                    <div className="mt-2 text-lg font-semibold">
                                        {discussion.title}
                                    </div>

                                    <div className="mt-2 text-sm text-white/40">
                                        Priority {discussion.priority} · Opportunity Score{" "}
                                        <span className="font-semibold text-[var(--athena-orange)]">
                                            {discussion.opportunity_score}
                                        </span>
                                    </div>
                                </div>

                                <Link
                                    href={`/discussions/${discussion.id}`}
                                    className="shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                                >
                                    Open Discussion
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}