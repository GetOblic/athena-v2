import Link from "next/link";
import { getReviews } from "@/services/reviewService";

export default async function ReviewsPage() {
    const reviews = await getReviews();

    return (
        <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
            <div className="mb-10">
                <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                    Executive Briefings
                </div>

                <h1 className="mt-4 text-5xl font-semibold tracking-tight">Executive Briefings</h1>

                <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
                    Human-supervised intelligence reviews generated from discussions and
                    opportunities.
                </p>
            </div>

            <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
                <div className="grid grid-cols-6 border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35">
                    <div className="col-span-2">Executive Briefing</div>
                    <div>Status</div>
                    <div>Buyer Stage</div>
                    <div>Confidence</div>
                    <div>CTA</div>
                </div>

                {reviews.length === 0 ? (
                    <div className="p-10 text-center text-white/40">
                        No reviews found.
                    </div>
                ) : (
                    reviews.map((review) => (
                        <div
                            key={review.id}
                            className="grid grid-cols-6 border-b border-white/5 px-6 py-5 text-sm last:border-b-0"
                        >
                            <Link
                                href={`/reviews/${review.id}`}
                                className="col-span-2 font-medium text-white transition hover:text-[var(--athena-orange)]"
                            >
                                {review.summary || "Untitled review"}
                            </Link>

                            <div className="text-[var(--athena-warning)]">
                                {review.status}
                            </div>

                            <div>{review.buyer_stage || "—"}</div>

                            <div className="font-semibold text-[var(--athena-orange)]">
                                {review.confidence}
                            </div>

                            <div className="truncate text-white/50">{review.cta || "—"}</div>
                        </div>
                    ))
                )}
            </div>
        </main>
    );
}