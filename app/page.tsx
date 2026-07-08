import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TodaysIntelligence } from "@/components/dashboard/TodaysIntelligence";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDashboardStats } from "@/services/dashboardService";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";
import { requireTenantContext } from "@/services/tenantContext";
import { getTodaysIntelligence } from "@/services/todaysIntelligenceService";

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

  const [identity, stats, todaysIntelligence] = await Promise.all([
    getAthenaIdentityByUserId(userId, organizationId),
    getDashboardStats(organizationId),
    getTodaysIntelligence(organizationId),
  ]);

  const name = identity?.greeting_name?.trim() || "there";
  const brainReady = identity?.brain_status === "ready";

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] text-white">
      <div className="flex min-h-screen">
        <DashboardSidebar activeHref="/" />

        <section className="flex-1 p-10">
          <AthenaBrandLink className="mb-8 md:hidden" />

          <div className="mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              Athena Dashboard
            </div>

            <h1 className="mt-4 text-5xl font-semibold tracking-tight">
              {timeGreeting()}, {name}.
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              Athena is monitoring your market, analyzing discussions,
              identifying opportunities and preparing reusable strategic assets.
            </p>
          </div>

          <TodaysIntelligence summary={todaysIntelligence} />

          <div className="mb-10 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-white/35">
                  Athena Brain
                </div>
                <h2 className="mt-3 text-3xl font-semibold">
                  {brainReady
                    ? "Your Athena Brain is trained."
                    : "Your Athena Brain needs training."}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">
                  {brainReady
                    ? "Athena has learned your voice, expertise, website and professional rules."
                    : "Train Athena once so every reply, briefing and asset blueprint reflects your voice and expertise."}
                </p>
              </div>

              <Link
                href="/identity"
                className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
              >
                {brainReady ? "Open Brain" : "Train Athena"}
              </Link>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="Discussions analyzed" value={stats.discussions} />
            <Metric label="Opportunities detected" value={stats.opportunities} />
            <Metric label="Draft briefings" value={stats.draftBriefings} />
            <Metric label="Approved briefings" value={stats.approvedBriefings} />
            <Metric
              label="Strategic blueprints"
              value={stats.strategicBlueprints}
            />
          </div>

          <div className="mt-10 grid gap-7 lg:grid-cols-3">
            <ActionCard
              title="Review Opportunities"
              description="See where Athena detected market intent and recommended action."
              href="/opportunities"
            />
            <ActionCard
              title="Continue Discussions"
              description="Open captured market conversations and review Athena's recommended replies."
              href="/discussions"
            />
            <ActionCard
              title="Open Briefings"
              description="Review executive briefings, CTAs and strategic recommendations."
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
