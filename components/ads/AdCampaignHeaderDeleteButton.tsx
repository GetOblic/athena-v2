"use client";

import {
  ConfirmDeleteControl,
  type ConfirmDeleteChrome,
} from "@/components/ui/ConfirmDeleteControl";

type AdCampaignHeaderDeleteButtonProps = {
  campaignId: string;
  confirmMessage?: string;
  errorFallback?: string;
  chrome?: ConfirmDeleteChrome;
};

export function AdCampaignHeaderDeleteButton({
  campaignId,
  confirmMessage,
  errorFallback,
  chrome,
}: AdCampaignHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage={
        confirmMessage ??
        "Delete this Ad campaign permanently? This cannot be undone."
      }
      deleteUrl={`/api/ads/${campaignId}`}
      redirectTo="/ads"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback={errorFallback ?? "Failed to delete ad campaign."}
      chrome={chrome}
    />
  );
}
