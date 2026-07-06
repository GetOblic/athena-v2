import Link from "next/link";
import { notFound } from "next/navigation";
import { getReviewById } from "@/services/reviewService";

type Props = {
    params: Promise<{
        id: string;
    }>;
};

export default async function BriefingPage({ params }: Props) {
    const { id } = await params;

    const review = await getReviewById(id);

    if (!review) {
        notFound();
    }

    return (
        <main className="min-h-screen bg-[var(--athena-bg)] p-8 text-white">

            <Link
                href="/briefings"
                className="text-sm text-[var(--athena-orange)]"
            >
                ← Back to Executive Briefings
            </Link>

            <div className="mt-10">

                <div className="text-xs uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                    ATHENA REVIEW
                </div>

                <h1 className="mt-4 text-5xl font-semibold">
                    Executive Briefing
                </h1>

                <p className="mt-4 text-white/50">
                    Human supervised intelligence report.
                </p>

            </div>

            <div className="mt-10 grid grid-cols-4 gap-6">

                <div className="rounded-3xl bg-[var(--athena-card)] p-8">
                    <div className="text-white/40">Status</div>

                    <div className="mt-4 text-4xl font-semibold text-[var(--athena-warning)]">
                        {review.status}
                    </div>
                </div>

                <div className="rounded-3xl bg-[var(--athena-card)] p-8">
                    <div className="text-white/40">
                        Buyer Stage
                    </div>

                    <div className="mt-4 text-2xl">
                        {review.buyer_stage}
                    </div>
                </div>

                <div className="rounded-3xl bg-[var(--athena-card)] p-8">
                    <div className="text-white/40">
                        Confidence
                    </div>

                    <div className="mt-4 text-4xl font-semibold text-[var(--athena-orange)]">
                        {review.confidence}
                    </div>
                </div>

                <div className="rounded-3xl bg-[var(--athena-card)] p-8">
                    <div className="text-white/40">
                        Discussion
                    </div>

                    <div className="mt-4 break-all text-sm">
                        {review.discussion_id}
                    </div>
                </div>

            </div>

            <div className="mt-8 rounded-3xl bg-[var(--athena-card)] p-8">

                <h2 className="mb-8 text-3xl font-semibold">
                    Athena Intelligence
                </h2>

                <div className="space-y-8">

                    <div>
                        <div className="mb-2 text-white/40">
                            Executive Summary
                        </div>

                        <p>{review.summary}</p>
                    </div>

                    <div>
                        <div className="mb-2 text-white/40">
                            Pain Points
                        </div>

                        <p>{review.pain_points}</p>
                    </div>

                    <div>
                        <div className="mb-2 text-white/40">
                            Recommended Response
                        </div>

                        <p>{review.recommended_response}</p>
                    </div>

                    <div>
                        <div className="mb-2 text-white/40">
                            CTA
                        </div>

                        <p>{review.cta}</p>
                    </div>

                </div>

            </div>

        </main>
    );
}