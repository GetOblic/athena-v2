export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { AthenaQuoteFormEmbed } from "@/components/quote/AthenaQuoteFormEmbed";
import { QuoteFormScrollLink } from "@/components/quote/QuoteFormScrollLink";
import {
  getLicenseeLocalization,
  type LicenseeMessages,
} from "@/lib/licensee/getLicenseeLocalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

function quoteWorkflowSteps(quote: LicenseeMessages["quote"]) {
  return [
    {
      step: "01",
      title: quote.step01Title,
      copy: quote.step01Copy,
    },
    {
      step: "02",
      title: quote.step02Title,
      copy: quote.step02Copy,
    },
    {
      step: "03",
      title: quote.step03Title,
      copy: quote.step03Copy,
    },
    {
      step: "04",
      title: quote.step04Title,
      copy: quote.step04Copy,
    },
  ] as const;
}

function quoteServiceCategories(quote: LicenseeMessages["quote"]) {
  return [
    {
      title: quote.websitesTitle,
      items: [
        quote.websitesBusiness,
        quote.websitesLanding,
        quote.websitesEcommerce,
        quote.websitesRedesign,
        quote.websitesCustom,
        quote.websitesWordpress,
        quote.websitesIntegrations,
        quote.websitesTroubleshooting,
      ],
    },
    {
      title: quote.infraTitle,
      items: [
        quote.infraCloudflare,
        quote.infraDns,
        quote.infraMigration,
        quote.infraHosting,
        quote.infraSsl,
        quote.infraPerformance,
        quote.infraSecurity,
        quote.infraBackup,
      ],
    },
    {
      title: quote.brandingTitle,
      items: [
        quote.brandingLogo,
        quote.brandingIdentity,
        quote.brandingBanners,
        quote.brandingAds,
        quote.brandingSocial,
        quote.brandingBrochures,
        quote.brandingCollateral,
      ],
    },
    {
      title: quote.marketingTitle,
      items: [
        quote.marketingSeo,
        quote.marketingLocalSeo,
        quote.marketingConversion,
        quote.marketingAnalytics,
        quote.marketingTracking,
        quote.marketingIntegrations,
        quote.marketingEmail,
      ],
    },
    {
      title: quote.aiTitle,
      items: [
        quote.aiImplementations,
        quote.aiWorkflow,
        quote.aiApi,
        quote.aiCrm,
        quote.aiCustom,
      ],
    },
  ] as const;
}

/**
 * Athena Quote — Master Licensee fulfillment quoting only.
 */
export default async function LicenseeAthenaQuotePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/licensee/login");
  }

  const licenseeAccount = await getLicenseeAccountByUserId(user.id);
  if (!licenseeAccount) {
    redirect("/api/licensee/master-marker?action=clear");
  }

  if (!(await isAccountAccessActive(user.id))) {
    redirect(
      `/licensee/login?message=${encodeURIComponent(
        "This Master account has been deactivated.",
      )}`,
    );
  }

  const cookieStore = await cookies();
  if (!cookieStore.get(LICENSEE_MASTER_MARKER_COOKIE)?.value) {
    redirect("/api/licensee/master-marker?action=refresh");
  }

  const { messages } = getLicenseeLocalization(
    licenseeAccount.default_language,
  );
  const quote = messages.quote;
  const workflowSteps = quoteWorkflowSteps(quote);
  const serviceCategories = quoteServiceCategories(quote);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <AthenaBrandLink className="mb-8" />

        <Link
          href="/licensee"
          className="text-sm text-[var(--athena-orange)]"
        >
          {messages.common.backToMasterDashboard}
        </Link>

        {/* Section 1 — Hero */}
        <div className="mb-14 mt-10 max-w-4xl">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {quote.eyebrow}
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            {quote.heroTitle}
          </h1>

          <p className="mt-4 text-xl text-white/70">
            {quote.heroLead}
          </p>

          <p className="mt-6 max-w-3xl text-base leading-7 text-white/50">
            {quote.heroBody}
          </p>

          <p className="mt-6 text-base font-medium leading-7 text-white/85">
            {quote.heroPriceControl}
          </p>

          <QuoteFormScrollLink className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90">
            {quote.requestCta}
          </QuoteFormScrollLink>

          <p className="mt-4 text-xs tracking-wide text-white/40">
            {quote.heroFootnote}
          </p>
        </div>

        <div className="space-y-10">
          {/* Section 2 — How it works */}
          <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {quote.howEyebrow}
            </div>
            <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
              {quote.howTitle}
            </h2>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {workflowSteps.map((item, index) => (
                <article
                  key={item.step}
                  className="relative rounded-2xl border border-white/10 bg-black/25 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold tracking-[0.25em] text-[var(--athena-orange)]">
                      {item.step}
                    </span>
                    {index < workflowSteps.length - 1 && (
                      <span className="hidden text-white/20 xl:inline">→</span>
                    )}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    {item.copy}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* Section 3 — What can you quote? */}
          <section>
            <div className="mb-6 max-w-3xl">
              <h2 className="text-2xl font-semibold md:text-3xl">
                {quote.categoriesTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/50 md:text-base">
                {quote.categoriesIntro}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {serviceCategories.map((category) => (
                <article
                  key={category.title}
                  className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6"
                >
                  <h3 className="text-lg font-semibold">{category.title}</h3>
                  <ul className="mt-5 space-y-2.5">
                    {category.items.map((item) => (
                      <li
                        key={item}
                        className="flex gap-3 text-sm leading-6 text-white/60"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--athena-orange)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}

              <article className="rounded-[28px] border border-[var(--athena-orange)]/35 bg-gradient-to-br from-[var(--athena-card)] to-[#1a1410] p-6 shadow-[0_0_40px_rgba(255,102,0,0.06)] md:col-span-2 xl:col-span-1">
                <h3 className="text-lg font-semibold text-[var(--athena-orange)]">
                  {quote.somethingElseTitle}
                </h3>
                <p className="mt-4 text-base font-medium text-white/85">
                  {quote.somethingElseLead}
                </p>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  {quote.somethingElseBody}
                </p>
              </article>
            </div>
          </section>

          {/* Section 4 — Commercial / margin */}
          <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
            <h2 className="text-2xl font-semibold md:text-3xl">
              {quote.priceTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/50 md:text-base">
              {quote.priceIntro}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                  {quote.getoblicQuoteLabel}
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  $1,500
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                  {quote.clientPriceLabel}
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  $2,500
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--athena-orange)]">
                  {quote.marginLabel}
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-[var(--athena-orange)]">
                  $1,000
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/35">
              {quote.exampleOnly}
            </p>

            <p className="mt-5 text-sm leading-6 text-white/65 md:text-base">
              {quote.priceControl}
            </p>
          </section>

          {/* Section 5 — Core positioning */}
          <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-6 text-center shadow-[0_0_40px_rgba(255,102,0,0.06)] md:p-10">
            <h2 className="text-2xl font-semibold md:text-3xl">
              {quote.positioningTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
              {quote.positioningBody1}
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
              {quote.positioningBody2}
            </p>
            <p className="mx-auto mt-6 max-w-xl text-base font-medium text-white/85">
              {quote.positioningClose}
            </p>
          </section>

          {/* Section 6 — Quote request form */}
          <section id="athena-quote-form" className="scroll-mt-8">
            <div className="mb-6 max-w-3xl">
              <h2 className="text-2xl font-semibold md:text-3xl">
                {quote.formTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/50 md:text-base">
                {quote.formIntro}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/45">
                {quote.formHelp}
              </p>
            </div>

            <AthenaQuoteFormEmbed />
          </section>
        </div>
      </div>
    </main>
  );
}
