"use client";

import { ConfirmDeleteControl } from "@/components/ui/ConfirmDeleteControl";

type SeoReportHeaderDeleteButtonProps = {
  reportId: string;
};

export function SeoReportHeaderDeleteButton({
  reportId,
}: SeoReportHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage="Delete this SEO Intelligence report permanently? This cannot be undone."
      deleteUrl={`/api/seo/${reportId}`}
      redirectTo="/seo"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback="Failed to delete SEO report."
    />
  );
}
