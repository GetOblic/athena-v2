import Link from "next/link";
import { getDiscussions } from "@/services/discussionService";

export default async function DiscussionsPage() {
    const discussions = await getDiscussions();

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
                <div className="grid grid-cols-7 border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35">
                    <div>Platform</div>
                    <div className="col-span-2">Discussion</div>
                    <div>Status</div>
                    <div>Priority</div>
                    <div>Score</div>
                    <div>Author</div>
                </div>

                {discussions.length === 0 ? (
                    <div className="p-10 text-center text-white/40">
                        No discussions found.
                    </div>
                ) : (
                    discussions.map((discussion) => (
                        <div
                            key={discussion.id}
                            className="grid grid-cols-7 border-b border-white/5 px-6 py-5 text-sm last:border-b-0"
                        >
                            <div className="text-white/70">{discussion.platform}</div>

                            <Link
                                href={`/discussions/${discussion.id}`}
                                className="col-span-2 font-medium text-white transition hover:text-[var(--athena-orange)]"
                            >
                                {discussion.title}
                            </Link>

                            <div className="text-[var(--athena-warning)]">
                                {discussion.status}
                            </div>

                            <div>{discussion.priority}</div>

                            <div className="font-semibold text-[var(--athena-orange)]">
                                {discussion.opportunity_score}
                            </div>

                            <div className="text-white/50">{discussion.author}</div>
                        </div>
                    ))
                )}
            </div>
        </main>
    );
}