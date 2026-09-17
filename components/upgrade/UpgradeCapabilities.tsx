import type {
  UpgradeAccent,
  UpgradeCapabilities,
} from "@/lib/upgrade/upgradePresentation";
import { UPGRADE_ACCENT_PIP } from "@/components/upgrade/upgradeVisual";

export function UpgradeCapabilitiesList({
  capabilities,
  accent,
  id,
}: {
  capabilities: UpgradeCapabilities;
  accent: UpgradeAccent;
  id?: string;
}) {
  return (
    <ul id={id} className="mt-4 list-none space-y-2 p-0">
      {capabilities.map((capability) => (
        <li key={capability.id} className="flex items-start gap-2.5">
          <span
            className={`mt-1.5 size-1.5 shrink-0 rounded-full ${UPGRADE_ACCENT_PIP[accent]}`}
            aria-hidden="true"
          />
          <span className="text-sm leading-6 text-white/75">
            {capability.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
