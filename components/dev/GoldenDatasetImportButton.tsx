"use client";

import { useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type GoldenDatasetImportButtonProps = {
  title: string;
  body: string;
  platform?: string;
  url?: string;
};

type ImportResponse = {
  success?: boolean;
  discussion?: { id?: string };
  discussionId?: string;
  error?: string | { message?: string };
};

export function GoldenDatasetImportButton({
  title,
  body,
  platform = "Golden Dataset",
  url = "https://example.com/golden-dataset",
}: GoldenDatasetImportButtonProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleImport() {
    if (isImporting) {
      return;
    }

    setIsImporting(true);
    setStatus(null);

    try {
      const response = await fetch("/api/ingestion/facebook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-athena-ingestion-key": "local-athena-ingestion-key",
        },
        body: JSON.stringify({
          platform,
          title,
          body,
          author: "Golden Dataset",
          url,
        }),
      });

      const payload = await parseJsonResponse<ImportResponse>(response, {
        unexpectedMessage:
          "Athena received an unexpected server response while queuing this discussion.",
      });

      if (!response.ok || !payload.success) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message || "Import failed.";
        throw new Error(message);
      }

      const discussionId = payload.discussionId ?? payload.discussion?.id;
      setStatus(
        discussionId
          ? `Imported and queued. Discussion: ${discussionId}`
          : "Imported and queued.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleImport}
        disabled={isImporting}
        className="rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white disabled:opacity-40"
      >
        {isImporting ? "Importing..." : "Import"}
      </button>

      {status && <div className="text-xs text-white/50">{status}</div>}
    </div>
  );
}
