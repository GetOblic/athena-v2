"use client";

import { useState } from "react";

type CommunityOption = {
  id: string;
  group_name: string;
};

type FacebookInboxFormProps = {
  communities: CommunityOption[];
};

export function FacebookInboxForm({ communities }: FacebookInboxFormProps) {
  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; discussionId?: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/ingestion/facebook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          communityId: communityId || null,
          title: title || null,
          author: author || null,
          url: url || null,
          body,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to import discussion.");
      }

      setResult({
        ok: true,
        message: "Discussion imported and processed. Briefing is ready if Athena detected an opportunity.",
        discussionId: payload.discussion?.id,
      });

      setTitle("");
      setAuthor("");
      setUrl("");
      setBody("");
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : "Failed to import discussion.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6"
    >
      <div className="grid gap-5">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Community
          </span>
          <select
            value={communityId}
            onChange={(event) => setCommunityId(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">No community selected</option>
            {communities.map((community) => (
              <option key={community.id} value={community.id}>
                {community.group_name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-5 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              Title optional
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Athena can infer it"
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              Author optional
            </span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Facebook author"
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
              placeholder="Facebook post URL"
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
            />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            Facebook discussion
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={14}
            placeholder="Paste the Facebook group discussion here. Athena will normalize it into the intelligence pipeline."
            className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting || !body.trim()}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Importing..." : "Import Discussion"}
          </button>

          {result && (
            <div className={result.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
              {result.message}
              {result.discussionId ? (
                <>
                  {" "}
                  <a
                    href={`/discussions/${result.discussionId}`}
                    className="text-[var(--athena-orange)] underline"
                  >
                    Open discussion
                  </a>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
