import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { GettingStartedConversationPanel } from "@/components/getting-started/GettingStartedConversationPanel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const workflowSteps = [
  "Conversation",
  "Athena Analysis",
  "Opportunity Detection",
  "Executive Intelligence",
  "Deployment Assets",
  "Strategic Asset Blueprint",
  "Business Growth",
];

const bestPractices = [
  "Train Athena before importing discussions.",
  "Review Opportunities daily.",
  "Use Deployment Assets instead of writing manually.",
  "Reuse Strategic Asset Blueprints across channels.",
  "Keep feeding Athena new conversations.",
];

export default async function GettingStartedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { messages } = await getTenantLocalization();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] text-white">
      <div className="flex min-h-screen">
        <DashboardSidebar activeHref="/getting-started" messages={messages} />

        <section className="flex-1 p-10">
          <AthenaBrandLink
            className="mb-8 md:hidden"
            tagline={messages.chrome.tagline}
            logoutLabel={messages.chrome.logOut}
            sessionActionsLabel={messages.chrome.sessionActions}
          />

          <div className="mb-12 max-w-4xl">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              Getting Started
            </div>

            <h1 className="mt-4 text-5xl font-semibold tracking-tight">
              Welcome to Athena
            </h1>

            <p className="mt-3 text-xl text-white/70">
              Your AI Market Intelligence Partner
            </p>

            <p className="mt-6 text-base leading-7 text-white/50">
              Import the conversations that matter to your business, and Athena
              analyzes them to identify opportunities, generate intelligence,
              and prepare strategic assets. Think of Athena as your intelligent
              teammate that helps you analyze important business conversations
              and turn them into actionable intelligence.
            </p>
          </div>

          <GettingStartedConversationPanel />

          <div className="max-w-4xl space-y-6">
            <GuideCard
              step="Step 1"
              title="Train Athena Brain"
              description="Start by teaching Athena your voice, expertise, website and business rules. This helps every reply, briefing and asset sound like you — not a generic assistant."
              buttonLabel="Open Athena Brain"
              href="/identity"
            />

            <GuideCard
              step="Step 2"
              title="Add Conversations"
              description="Bring in discussions from Facebook, Instagram, Reddit, LinkedIn, email, support conversations, interviews, or meeting notes. The more real market conversations Athena sees, the smarter your insights become."
              buttonLabel="Open Inbox"
              href="/inbox"
            />

            <GuideCard
              step="Step 3"
              title="Review Discussions"
              description="Athena analyzes each discussion and shows you intent, buyer concern, opportunity signals and recommended next steps — all in plain language."
              buttonLabel="View Discussions"
              href="/discussions"
            />

            <GuideCard
              step="Step 4"
              title="Review Opportunities"
              description="Opportunities filters the most valuable discussions so you can focus on conversations most likely to turn into business."
              buttonLabel="View Opportunities"
              href="/opportunities"
            />

            <GuideCard
              step="Step 5"
              title="Read Briefings"
              description="Briefings summarize the most important insights and strategy for each opportunity — like a concise executive summary you can act on quickly."
              buttonLabel="Open Briefings"
              href="/briefings"
            />

            <GuideCard
              step="Step 6"
              title="Use Deployment Assets"
              description="Copy-ready replies, private messages, follow-ups, calls to action and social posts — generated for you and ready to paste into your platform of choice, email or DMs."
            />

            <GuideCard
              step="Step 7"
              title="Use Strategic Asset Blueprints"
              description="Reusable asset prompts for PDFs, images, carousels, lead magnets and educational content. Create once, reuse across your marketing channels."
            />

            <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                How Athena Works
              </div>

              <h2 className="mt-3 text-2xl font-semibold">
                From conversation to growth
              </h2>

              <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                {workflowSteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
                      {step}
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <span className="hidden text-white/25 lg:inline">→</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                Best Practices
              </div>

              <h2 className="mt-3 text-2xl font-semibold">
                Get the most from Athena
              </h2>

              <ul className="mt-6 space-y-4">
                {bestPractices.map((practice) => (
                  <li
                    key={practice}
                    className="flex gap-3 text-sm leading-6 text-white/65"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--athena-orange)]" />
                    <span>{practice}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-8 text-center shadow-[0_0_40px_rgba(255,102,0,0.06)]">
              <h2 className="text-3xl font-semibold">Ready to begin?</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
                Train Athena, import relevant discussions, and let Athena
                transform them into actionable intelligence.
              </p>
              <Link
                href="/identity"
                className="mt-6 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
              >
                Open Athena Brain
              </Link>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function GuideCard({
  step,
  title,
  description,
  buttonLabel,
  href,
}: {
  step: string;
  title: string;
  description: string;
  buttonLabel?: string;
  href?: string;
}) {
  return (
    <article className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {step}
      </div>

      <h2 className="mt-3 text-2xl font-semibold">{title}</h2>

      <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
        {description}
      </p>

      {buttonLabel && href && (
        <Link
          href={href}
          className="mt-6 inline-block rounded-full border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10 px-6 py-3 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20"
        >
          {buttonLabel}
        </Link>
      )}
    </article>
  );
}
