import { getCommunityCount } from "@/services/communityService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export async function StatsCards() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const communityCount = await getCommunityCount(organizationId);

  const metrics = [
    ["Intelligence Domains", String(communityCount), "Markets Athena understands"],
    ["Discussions", "0", "Captured discussions"],
    ["Opportunities", "0", "High-value opportunities"],
    ["Briefings", "0", "Generated executive briefings"],
  ];

  return (
    <div className="grid gap-6 md:grid-cols-4">
      {metrics.map(([title, value, subtitle]) => (
        <div
          key={title}
          className="rounded-[22px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-7"
        >
          <div className="text-sm text-white/40">{title}</div>
          <div className="mt-6 text-5xl font-semibold">{value}</div>
          <div className="mt-3 text-xs text-white/30">{subtitle}</div>
        </div>
      ))}
    </div>
  );
}
