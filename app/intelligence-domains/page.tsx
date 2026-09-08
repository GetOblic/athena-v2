export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
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
  const [domains, discussionCounts, { messages }] = await Promise.all([
    getIntelligenceDomains(organizationId),
    getIntelligenceDomainDiscussionCounts(organizationId),
    getTenantLocalization(),
  ]);
  const copy = messages.intelligenceDomains;

  return (
    <TenantAppShell currentPath="/intelligence-domains" messages={messages}>
          <div className="mb-10">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {copy.eyebrow}
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              {copy.title}
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              {copy.subtitle}
            </p>
          </div>

          {params.created === "true" && (
            <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-300">
              {copy.created}
            </div>
          )}

          {params.error === "create_failed" && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
              {copy.createFailed}
            </div>
          )}

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 overflow-hidden rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-4 sm:p-6">
              {domains.length === 0 ? (
                <div className="p-6 text-center text-white/40">
                  {copy.empty}
                </div>
              ) : (
                <div className="space-y-4">
                  {domains.map((domain) => (
                    <IntelligenceDomainCard
                      key={domain.id}
                      domain={domain}
                      discussionCount={discussionCounts.get(domain.id) ?? 0}
                      messages={copy}
                    />
                  ))}
                </div>
              )}
            </div>

            <CreateIntelligenceDomainForm action={createDomain} messages={copy} />
          </div>
    </TenantAppShell>
  );
}
