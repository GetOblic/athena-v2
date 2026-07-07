"use client";

import { useState } from "react";

type AppendDiscussionUpdateFormProps = {
  discussionId: string;
};

export function AppendDiscussionUpdateForm({
  discussionId,
}: AppendDiscussionUpdateFormProps) {
  const [author, setAuthor] = useState("");
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
          author: author || null,
          url: url || null,
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
          "Thread update appended and reprocessed. Refresh to view the latest analysis.",
      });

      setAuthor("");
      setUrl("");
      setBody("");
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to append thread update.",
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
      <h2 className="text-xl font-semibold">Append Facebook Thread Update</h2>

      <p className="mt-3 text-sm leading-6 text-white/45">
        Paste new replies, reactions or follow-up messages from the same Facebook
        discussion. Athena appends them to the existing thread and re-runs the
        workflow.
      </p>

      <div className="mt-6 grid gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              Author optional
            </span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Reply author"
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              URL optional
            </span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Facebook comment or post URL"
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
            />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            New replies / reactions / messages
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={8}
            placeholder="Paste the new Facebook thread activity here."
            className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
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
            <div className={result.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
              {result.message}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
