import type { ReactNode } from "react";
import {
  Building2,
  CircleAlert,
  PlugZap,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  SuperAdminDomainId,
  SuperAdminOverviewCounts,
} from "@/lib/superAdmin/superAdminDashboardView";
import {
  SUPER_ADMIN_ICON_WELL,
  SUPER_ADMIN_TILE_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";

type SuperAdminOverviewSectionProps = {
  counts: SuperAdminOverviewCounts;
  onNavigate: (domain: SuperAdminDomainId) => void;
};

export function SuperAdminOverviewSection({
  counts,
  onNavigate,
}: SuperAdminOverviewSectionProps) {
  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
          Overview
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          Command center
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
          Operational counts from the Super Admin control plane already loaded
          on this page. Tiles open a Super Admin domain. Tenant intelligence
          stays isolated inside each account.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OverviewTile
          icon={<Building2 size={18} />}
          accent="blue"
          label="Licensee Masters"
          value={String(counts.licenseeMasters)}
          detail={
            counts.licenseesWithZeroSubAccounts === 1
              ? "1 Licensee with zero sub-accounts"
              : `${counts.licenseesWithZeroSubAccounts} Licensees with zero sub-accounts`
          }
          onClick={() => onNavigate("licensees")}
        />
        <OverviewTile
          icon={<Users size={18} />}
          accent="violet"
          label="Ordinary Athena accounts"
          value={String(counts.ordinaryAthenaAccounts)}
          detail={`${counts.activeAccounts} active · ${counts.deactivatedAccounts} deactivated`}
          onClick={() => onNavigate("athena-accounts")}
        />
        <OverviewTile
          icon={<ShieldCheck size={18} />}
          accent="green"
          label="Active accounts"
          value={String(counts.activeAccounts)}
          detail={`${counts.deactivatedAccounts} deactivated`}
          onClick={() => onNavigate("licensees")}
        />
        <OverviewTile
          icon={<CircleAlert size={18} />}
          accent="warm"
          label="Deactivated accounts"
          value={String(counts.deactivatedAccounts)}
          detail="Identity and tenant data are retained"
          onClick={() => onNavigate("athena-accounts")}
        />
        <OverviewTile
          icon={<PlugZap size={18} />}
          accent="magenta"
          label="GetOblic organizations"
          value={String(counts.getoblicUnconfigured)}
          detail={
            counts.getoblicCapacityZero === 1
              ? "unconfigured · 1 capacity zero"
              : `unconfigured · ${counts.getoblicCapacityZero} capacity zero`
          }
          onClick={() => onNavigate("licensees")}
        />
        <OverviewTile
          icon={<ScrollText size={18} />}
          accent="orange"
          label="System instructions"
          value={
            counts.trendSocialPromptConfigured &&
            counts.estimateMethodologyConfigured
              ? "Configured"
              : "Not configured"
          }
          detail={`Trend Social Prompt ${
            counts.trendSocialPromptConfigured
              ? "configured"
              : "not configured"
          } · Estimate methodology ${
            counts.estimateMethodologyConfigured
              ? "configured"
              : "not configured"
          }`}
          onClick={() => onNavigate("system-configuration")}
        />
      </div>
    </section>
  );
}

function OverviewTile({
  icon,
  accent,
  label,
  value,
  detail,
  onClick,
}: {
  icon: ReactNode;
  accent: "orange" | "blue" | "violet" | "green" | "warm" | "magenta";
  label: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={SUPER_ADMIN_TILE_CLASS}>
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 place-items-center rounded-2xl ${SUPER_ADMIN_ICON_WELL[accent]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {value}
          </div>
          <div className="mt-1 text-sm leading-6 text-white/45">{detail}</div>
        </div>
      </div>
    </button>
  );
}
