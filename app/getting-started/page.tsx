import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { GettingStartedConversationPanel } from "@/components/getting-started/GettingStartedConversationPanel";
import { tenantConversationWrapperChrome } from "@/lib/tenantI18n/conversationChrome";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GettingStartedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { messages } = await getTenantLocalization();
  const copy = messages.gettingStarted;
  const conversationChrome = tenantConversationWrapperChrome(messages);
  const workflowSteps = [
    copy.workflowConversation,
    copy.workflowAnalysis,
    copy.workflowOpportunity,
    copy.workflowExecutiveIntelligence,
    copy.workflowDeploymentAssets,
    copy.workflowBlueprints,
    copy.workflowGrowth,
  ];
  const bestPractices = [
    copy.practice1,
    copy.practice2,
    copy.practice3,
    copy.practice4,
    copy.practice5,
  ];

  return (
    <TenantAppShell currentPath="/getting-started" messages={messages}>
          <div className="mb-12 max-w-4xl">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {copy.eyebrow}
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              {copy.title}
            </h1>

            <p className="mt-3 text-xl text-white/70">{copy.tagline}</p>

            <p className="mt-6 text-base leading-7 text-white/50">{copy.intro}</p>
          </div>

          <GettingStartedConversationPanel
            title={copy.conversationTitle}
            description={copy.conversationDescription}
            placeholder={copy.conversationPlaceholder}
            inputLabel={copy.conversationInputLabel}
            examplePrompts={[
              copy.example1,
              copy.example2,
              copy.example3,
              copy.example4,
              copy.example5,
              copy.example6,
            ]}
            chrome={conversationChrome.chrome}
            clearLabel={conversationChrome.clearLabel}
            submitLabel={conversationChrome.submitLabel}
            emptyStateTitle={conversationChrome.emptyStateTitle}
            readOnlyNotice={conversationChrome.readOnlyNotice}
          />

          <div className="max-w-4xl space-y-6">
            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 1 })}
              title={copy.step1Title}
              description={copy.step1Description}
              buttonLabel={copy.step1Cta}
              href="/identity"
            />

            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 2 })}
              title={copy.step2Title}
              description={copy.step2Description}
              buttonLabel={copy.step2Cta}
              href="/inbox"
            />

            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 3 })}
              title={copy.step3Title}
              description={copy.step3Description}
              buttonLabel={copy.step3Cta}
              href="/discussions"
            />

            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 4 })}
              title={copy.step4Title}
              description={copy.step4Description}
              buttonLabel={copy.step4Cta}
              href="/opportunities"
            />

            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 5 })}
              title={copy.step5Title}
              description={copy.step5Description}
              buttonLabel={copy.step5Cta}
              href="/briefings"
            />

            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 6 })}
              title={copy.step6Title}
              description={copy.step6Description}
            />

            <GuideCard
              step={interpolateTenantMessage(copy.stepLabel, { n: 7 })}
              title={copy.step7Title}
              description={copy.step7Description}
            />

            <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
                {copy.howItWorksEyebrow}
              </div>

              <h2 className="mt-3 text-2xl font-semibold">
                {copy.howItWorksTitle}
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
                {copy.bestPracticesEyebrow}
              </div>

              <h2 className="mt-3 text-2xl font-semibold">
                {copy.bestPracticesTitle}
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
              <h2 className="text-3xl font-semibold">{copy.readyTitle}</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">
                {copy.readyBody}
              </p>
              <Link
                href="/identity"
                className="mt-6 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
              >
                {copy.readyCta}
              </Link>
            </section>
          </div>
    </TenantAppShell>
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
