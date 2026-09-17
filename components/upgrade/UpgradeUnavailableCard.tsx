"use client";

import { UpgradeSurface, type UpgradeSurfaceProps } from "@/components/upgrade/UpgradeSurface";

export type UpgradeUnavailableCardProps = Omit<UpgradeSurfaceProps, "variant">;

export function UpgradeUnavailableCard(props: UpgradeUnavailableCardProps) {
  return <UpgradeSurface {...props} variant="unavailable" />;
}
