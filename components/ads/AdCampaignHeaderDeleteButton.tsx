"use client";

import { ConfirmDeleteControl } from "@/components/ui/ConfirmDeleteControl";

type AdCampaignHeaderDeleteButtonProps = {
  campaignId: string;
};

export function AdCampaignHeaderDeleteButton({
  campaignId,
}: AdCampaignHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage="Delete this Ad campaign permanently? This cannot be undone."
      deleteUrl={`/api/ads/${campaignId}`}
      redirectTo="/ads"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback="Failed to delete ad campaign."
    />
  );
}
