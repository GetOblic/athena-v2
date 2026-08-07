export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { AthenaQuoteFormEmbed } from "@/components/quote/AthenaQuoteFormEmbed";
import { QuoteFormScrollLink } from "@/components/quote/QuoteFormScrollLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LICENSEE_MASTER_MARKER_COOKIE } from "@/services/licensee/licenseeCookieNames";
import { getLicenseeAccountByUserId } from "@/services/licensee/licenseeIdentity";
import { isAccountAccessActive } from "@/services/superAdmin/accountAccessStatus";

const workflowSteps = [
  {
    step: "01",
    title: "Your Client Asks",
    copy: "A client needs a website, branding, infrastructure work, security, technical configuration, creative work, automation or another digital service.",
  },
  {
    step: "02",
    title: "Ask Athena Quote",
    copy: "Submit the project requirements, references, files, objectives, timing and any known budget information.",
  },
  {
    step: "03",
    title: "GetOblic Quotes You",
    copy: "We review the scope and provide your agency with a private fulfillment price.",
  },
  {
    step: "04",
    title: "You Sell It",
    copy: "Add your own markup, present your own price to the client, and keep control of the commercial relationship.",
  },
] as const;

const serviceCategories = [
  {
    title: "Websites & Development",
    items: [
      "Business websites",
      "Landing pages",
      "E-commerce",
      "Website redesign",
      "Custom functionality",
      "WordPress work",
      "Integrations",
      "Troubleshooting",
    ],
  },
  {
    title: "Infrastructure & Security",
    items: [
      "Cloudflare setup",
      "DNS configuration",
      "Website migration",
      "Hosting",
      "SSL",
      "Performance optimization",
      "Security hardening",
      "Backup configuration",
    ],
  },
  {
    title: "Branding & Creative",
    items: [
      "Logo design",
      "Brand identity",
      "Banners",
      "Advertising creatives",
      "Social media assets",
      "Brochures",
      "Digital collateral",
    ],
  },
  {
    title: "Marketing & Growth",
    items: [
      "SEO projects",
      "Local SEO",
      "Conversion pages",
      "Analytics",
      "Tracking setup",
      "Marketing integrations",
      "Email infrastructure",
    ],
  },
  {
    title: "AI & Automation",
    items: [
      "AI implementations",
      "Workflow automation",
      "API integrations",
      "CRM configuration",
      "Custom AI projects",
    ],
  },
] as const;

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

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <AthenaBrandLink className="mb-8" />

        <Link
          href="/licensee"
          className="text-sm text-[var(--athena-orange)]"
        >
          ← Back to Master dashboard
        </Link>

        {/* Section 1 — Hero */}
        <div className="mb-14 mt-10 max-w-4xl">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Athena Quote
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            You Sell It. We Build It.
          </h1>

          <p className="mt-4 text-xl text-white/70">
            Turn almost any client request into a service you can offer.
          </p>

          <p className="mt-6 max-w-3xl text-base leading-7 text-white/50">
            Your client needs something outside your current capabilities?
            Send it to us. From websites and branding to Cloudflare, security,
            integrations, development, AI, automation and custom digital work,
            submit the project requirements and GetOblic will prepare a private
            fulfillment quote for your agency.
          </p>

          <p className="mt-6 text-base font-medium leading-7 text-white/85">
            You receive our price. You decide what you charge your client.
          </p>

          <QuoteFormScrollLink className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90">
            Request a Quote
          </QuoteFormScrollLink>

          <p className="mt-4 text-xs tracking-wide text-white/40">
            No commitment · Private fulfillment pricing · Your client remains
            yours
          </p>
        </div>

        <div className="space-y-10">
          {/* Section 2 — How it works */}
          <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              How It Works
            </div>
            <h2 className="mt-3 text-2xl font-semibold md:text-3xl">
              From client request to your sale
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
                If Your Client Needs It, Ask Us.
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/50 md:text-base">
                Athena Quote extends the range of services your agency can
                confidently offer without requiring you to employ every
                specialist yourself.
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
                  Something Else?
                </h3>
                <p className="mt-4 text-base font-medium text-white/85">
                  Submit it anyway.
                </p>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  If it falls within what a modern web, creative, AI or digital
                  agency can deliver, GetOblic can evaluate it.
                </p>
              </article>
            </div>
          </section>

          {/* Section 4 — Commercial / margin */}
          <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 md:p-8">
            <h2 className="text-2xl font-semibold md:text-3xl">
              Your Price Is Your Business
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/50 md:text-base">
              Athena Quote gives you GetOblic&apos;s private fulfillment
              price. It does not determine what you charge your client.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                  GetOblic fulfillment quote
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  $1,500
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                  Your client price
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  $2,500
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-5 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--athena-orange)]">
                  Your gross margin
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-[var(--athena-orange)]">
                  $1,000
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/35">
              Example only
            </p>

            <p className="mt-5 text-sm leading-6 text-white/65 md:text-base">
              You control your client relationship, positioning and markup.
            </p>
          </section>

          {/* Section 5 — Core positioning */}
          <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-6 text-center shadow-[0_0_40px_rgba(255,102,0,0.06)] md:p-10">
            <h2 className="text-2xl font-semibold md:text-3xl">
              Never Say “We Don&apos;t Do That” Again.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
              Athena Quote extends your agency far beyond the services you
              personally know how to deliver.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
              When a client asks for something outside your expertise, don&apos;t
              send the opportunity somewhere else. Bring the opportunity to
              GetOblic.
            </p>
            <p className="mx-auto mt-6 max-w-xl text-base font-medium text-white/85">
              Say yes to the opportunity. Let us help you fulfill it.
            </p>
          </section>

          {/* Section 6 — Quote request form */}
          <section id="athena-quote-form" className="scroll-mt-8">
            <div className="mb-6 max-w-3xl">
              <h2 className="text-2xl font-semibold md:text-3xl">
                Request a GetOblic Fulfillment Quote
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/50 md:text-base">
                Tell us what your client needs. The more context you provide,
                the more accurately we can scope and price the project.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/45">
                If you&apos;re not sure how the work should be scoped
                technically, submit what you know. GetOblic can help evaluate
                the appropriate solution.
              </p>
            </div>

            <AthenaQuoteFormEmbed />
          </section>
        </div>
      </div>
    </main>
  );
}
