"use client";

import {
  ConfirmDeleteControl,
  type ConfirmDeleteChrome,
} from "@/components/ui/ConfirmDeleteControl";

type SeoReportHeaderDeleteButtonProps = {
  reportId: string;
  confirmMessage?: string;
  errorFallback?: string;
  chrome?: ConfirmDeleteChrome;
};

export function SeoReportHeaderDeleteButton({
  reportId,
  confirmMessage,
  errorFallback,
  chrome,
}: SeoReportHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage={
        confirmMessage ??
        "Delete this SEO Intelligence report permanently? This cannot be undone."
      }
      deleteUrl={`/api/seo/${reportId}`}
      redirectTo="/seo"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback={errorFallback ?? "Failed to delete SEO report."}
      chrome={chrome}
    />
  );
}
