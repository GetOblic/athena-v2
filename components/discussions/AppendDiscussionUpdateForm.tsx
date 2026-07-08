"use client";

import { useState } from "react";

type AppendDiscussionUpdateFormProps = {
  discussionId: string;
};

export function AppendDiscussionUpdateForm({
  discussionId,
}: AppendDiscussionUpdateFormProps) {
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch(`/api/discussions/${discussionId}/updates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim() || null,
          body,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to append update.");
      }

      setResult({
        ok: true,
        message:
          "Thread updated successfully.\n\nAthena is regenerating:\n• Discussion Analysis\n• Opportunities\n• Executive Briefing\n• Strategic Assets\n\nWhen processing is complete, click the \"Refresh AI Analysis\" button below to load the latest intelligence.",
      });

      setUrl("");
      setBody("");
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to append discussion update.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8"
    >
      <h2 className="text-xl font-semibold">Append Discussion Update</h2>

      <p className="mt-3 text-sm leading-6 text-white/45">
        Paste new replies, reactions or follow-up messages from the same
        discussion. Athena appends them to the existing thread and re-runs the
        workflow.
      </p>

      <div className="mt-6 grid gap-5">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Discussion Update
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={8}
            placeholder="Paste the new thread activity here."
            className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Source URL optional
          </span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Only if this update comes from a different source"
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting || !body.trim()}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Updating..." : "Append & Reprocess"}
          </button>

          {result && (
            <div
              className={
                result.ok
                  ? "max-w-2xl whitespace-pre-line text-sm leading-6 text-emerald-300"
                  : "text-sm text-red-300"
              }
            >
              {result.message}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
