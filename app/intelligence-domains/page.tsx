export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { CreateIntelligenceDomainForm } from "@/components/intelligenceDomains/CreateIntelligenceDomainForm";
import { IntelligenceDomainStatusBadge } from "@/components/intelligenceDomains/IntelligenceDomainStatusBadge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createIntelligenceDomain,
  getIntelligenceDomains,
} from "@/services/intelligenceDomainService";

async function createDomain(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const domain = await createIntelligenceDomain({
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
  const domains = await getIntelligenceDomains();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] text-white">
      <div className="flex min-h-screen">
        <DashboardSidebar activeHref="/intelligence-domains" />

        <section className="flex-1 p-10">
          <div className="mb-10">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              Market Context
            </div>

            <h1 className="mt-4 text-5xl font-semibold tracking-tight">
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

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px] border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35">
                <div>Name</div>
                <div>Market</div>
                <div>Status</div>
                <div>Priority</div>
              </div>

              {domains.length === 0 ? (
                <div className="p-10 text-center text-white/40">
                  No Intelligence Domains yet. Create your first domain to tell
                  Athena which market context to use.
                </div>
              ) : (
                domains.map((domain) => (
                  <div
                    key={domain.id}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px] items-center border-b border-white/5 px-6 py-5 text-sm last:border-b-0"
                  >
                    <div>
                      <Link
                        href={`/communities/${domain.id}`}
                        className="font-medium text-white transition hover:text-[var(--athena-orange)]"
                      >
                        {domain.group_name}
                      </Link>
                      {domain.notes ? (
                        <div className="mt-1 line-clamp-1 text-xs text-white/40">
                          {domain.notes}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-white/60">{domain.niche || "—"}</div>

                    <div>
                      <IntelligenceDomainStatusBadge status={domain.status} />
                    </div>

                    <div className="text-white/50">{domain.priority}</div>
                  </div>
                ))
              )}
            </div>

            <CreateIntelligenceDomainForm action={createDomain} />
          </div>
        </section>
      </div>
    </main>
  );
}
