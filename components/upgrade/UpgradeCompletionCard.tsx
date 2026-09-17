"use client";

import { UpgradeSurface, type UpgradeSurfaceProps } from "@/components/upgrade/UpgradeSurface";

export type UpgradeCompletionCardProps = Omit<UpgradeSurfaceProps, "variant">;

export function UpgradeCompletionCard(props: UpgradeCompletionCardProps) {
  return <UpgradeSurface {...props} variant="completion" />;
}
