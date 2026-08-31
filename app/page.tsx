import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { TodaysIntelligence } from "@/components/dashboard/TodaysIntelligence";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDashboardStats } from "@/services/dashboardService";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";
import { requireTenantContext } from "@/services/tenantContext";
import { getTodaysIntelligence } from "@/services/todaysIntelligenceService";

function timeGreetingKey(): "goodMorning" | "goodAfternoon" | "goodEvening" {
  const hour = new Date().getHours();
  if (hour < 12) return "goodMorning";
  if (hour < 18) return "goodAfternoon";
  return "goodEvening";
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId, userId } = await requireTenantContext();

  const [identity, stats, todaysIntelligence, { messages }] = await Promise.all([
    getAthenaIdentityByUserId(userId, organizationId),
    getDashboardStats(organizationId),
    getTodaysIntelligence(organizationId),
    getTenantLocalization(),
  ]);

  const name = identity?.greeting_name?.trim() || messages.dashboard.greetingFallback;
  const brainReady = identity?.brain_status === "ready";

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] text-white">
      <div className="flex min-h-screen">
        <DashboardSidebar activeHref="/" messages={messages} />

        <section className="flex-1 p-10">
          <AthenaBrandLink
            className="mb-8 md:hidden"
            tagline={messages.chrome.tagline}
            logoutLabel={messages.chrome.logOut}
            sessionActionsLabel={messages.chrome.sessionActions}
          />

          <div className="mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {messages.dashboard.eyebrow}
            </div>

            <h1 className="mt-4 text-5xl font-semibold tracking-tight">
              {messages.dashboard[timeGreetingKey()]}, {name}.
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              {messages.dashboard.subtitle}
            </p>
          </div>

          <TodaysIntelligence
            summary={todaysIntelligence}
            messages={messages.dashboard}
          />

          <div className="mb-10 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-white/35">
                  {messages.nav.athenaBrain}
                </div>
                <h2 className="mt-3 text-3xl font-semibold">
                  {brainReady
                    ? messages.dashboard.brainReadyTitle
                    : messages.dashboard.brainNeedsTitle}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">
                  {brainReady
                    ? messages.dashboard.brainReadyBody
                    : messages.dashboard.brainNeedsBody}
                </p>
              </div>

              <Link
                href="/identity"
                className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
              >
                {brainReady
                  ? messages.dashboard.openBrain
                  : messages.dashboard.trainAthena}
              </Link>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            <Metric
              label={messages.dashboard.metricDiscussions}
              value={stats.discussions}
            />
            <Metric
              label={messages.dashboard.metricOpportunities}
              value={stats.opportunities}
            />
            <Metric
              label={messages.dashboard.metricDraftBriefings}
              value={stats.draftBriefings}
            />
            <Metric
              label={messages.dashboard.metricApprovedBriefings}
              value={stats.approvedBriefings}
            />
            <Metric
              label={messages.dashboard.metricStrategicBlueprints}
              value={stats.strategicBlueprints}
            />
          </div>

          <div className="mt-10 grid gap-7 lg:grid-cols-3">
            <ActionCard
              title={messages.dashboard.reviewOpportunitiesTitle}
              description={messages.dashboard.reviewOpportunitiesDescription}
              href="/opportunities"
            />
            <ActionCard
              title={messages.dashboard.continueDiscussionsTitle}
              description={messages.dashboard.continueDiscussionsDescription}
              href="/discussions"
            />
            <ActionCard
              title={messages.dashboard.openBriefingsTitle}
              description={messages.dashboard.openBriefingsDescription}
              href="/briefings"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-7 shadow-sm shadow-black/20">
      <div className="text-xs font-medium uppercase tracking-[0.15em] text-white/50">
        {label}
      </div>
      <div className="mt-5 text-5xl font-semibold tabular-nums tracking-tight text-[var(--athena-orange)]">
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-7 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/60 hover:bg-white/[0.03] hover:shadow-lg hover:shadow-black/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-xl font-semibold text-white group-hover:text-[var(--athena-orange)]">
          {title}
        </div>
        <span className="text-lg text-white/20 transition group-hover:text-[var(--athena-orange)]">
          →
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/50 group-hover:text-white/60">
        {description}
      </p>
    </Link>
  );
}
