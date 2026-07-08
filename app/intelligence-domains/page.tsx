export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { CreateIntelligenceDomainForm } from "@/components/intelligenceDomains/CreateIntelligenceDomainForm";
import { IntelligenceDomainCard } from "@/components/intelligenceDomains/IntelligenceDomainRowActions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createIntelligenceDomain,
  getIntelligenceDomainDiscussionCounts,
  getIntelligenceDomains,
} from "@/services/intelligenceDomainService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

async function createDomain(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId } = await requireCurrentOrganizationContext();

  const domain = await createIntelligenceDomain({
    organization_id: organizationId,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    market: String(formData.get("market") ?? "") || null,
    status: String(formData.get("status") ?? "active") || "active",
  });

  if (!domain) {
    redirect("/intelligence-domains?error=create_failed");
  }

  redirect("/intelligence-domains?created=true");
}

export default async function IntelligenceDomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const { organizationId } = await requireCurrentOrganizationContext();
  const [domains, discussionCounts] = await Promise.all([
    getIntelligenceDomains(organizationId),
    getIntelligenceDomainDiscussionCounts(organizationId),
  ]);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] text-white">
      <div className="flex min-h-screen">
        <DashboardSidebar activeHref="/intelligence-domains" />

        <section className="min-w-0 flex-1 p-6 lg:p-10">
          <AthenaBrandLink className="mb-8 md:hidden" />

          <div className="mb-10">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              Market Context
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight lg:text-5xl">
              Intelligence Domains
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              Define the markets Athena should understand — each domain tells
              Athena which expertise, terminology and business context to apply
              when analyzing discussions.
            </p>
          </div>

          {params.created === "true" && (
            <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-300">
              Intelligence Domain created successfully.
            </div>
          )}

          {params.error === "create_failed" && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
              Could not create Intelligence Domain. Please check the name and try
              again.
            </div>
          )}

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 overflow-hidden rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-4 sm:p-6">
              {domains.length === 0 ? (
                <div className="p-6 text-center text-white/40">
                  No Intelligence Domains yet. Create your first domain to tell
                  Athena which market context to use.
                </div>
              ) : (
                <div className="space-y-4">
                  {domains.map((domain) => (
                    <IntelligenceDomainCard
                      key={domain.id}
                      domain={domain}
                      discussionCount={discussionCounts.get(domain.id) ?? 0}
                    />
                  ))}
                </div>
              )}
            </div>

            <CreateIntelligenceDomainForm action={createDomain} />
          </div>
        </section>
      </div>
    </main>
  );
}
