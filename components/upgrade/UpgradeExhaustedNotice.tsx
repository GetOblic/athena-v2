"use client";

import { UpgradeSurface, type UpgradeSurfaceProps } from "@/components/upgrade/UpgradeSurface";

export type UpgradeExhaustedNoticeProps = Omit<UpgradeSurfaceProps, "variant">;

export function UpgradeExhaustedNotice(props: UpgradeExhaustedNoticeProps) {
  return <UpgradeSurface {...props} variant="exhausted" />;
}
