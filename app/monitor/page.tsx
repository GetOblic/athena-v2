export const dynamic = "force-dynamic";

import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { MonitorWorkspace } from "@/components/monitor/MonitorWorkspace";
import { UpgradeUnavailableCard } from "@/components/upgrade/UpgradeUnavailableCard";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { createUpgradeCapabilities } from "@/lib/upgrade/upgradePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";

export default async function MonitorPage() {
  const [progression, localization] = await Promise.all([
    loadFreeProgressionState(),
    getTenantLocalization(),
  ]);
  const { messages, locale } = localization;
  const copy = messages.monitor;
  const entitled = progression.athenaPlan === "full";

  return (
    <TenantAppShell
      currentPath="/monitor"
      messages={messages}
      athenaPlan={progression.athenaPlan}
      defineKind={progression.defineKind}
    >
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
      />
      {entitled ? (
        <MonitorWorkspace messages={messages} locale={locale} />
      ) : (
        <UpgradeUnavailableCard
          feature="monitor"
          eyebrow={messages.upgrade.fullAthena}
          headline={messages.upgrade.availableWithFullAthena}
          supportingText={copy.lockedExplanation}
          capabilities={createUpgradeCapabilities([
            copy.lockedCapabilities.one,
            copy.lockedCapabilities.two,
            copy.lockedCapabilities.three,
          ])}
          ctaLabel={messages.upgrade.continueWithFullAthena}
        />
      )}
    </TenantAppShell>
  );
}
