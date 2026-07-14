"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type IntelligenceDomainOption = {
  id: string;
  name: string;
};

type DiscussionRecord = {
  id: string;
  platform: string;
  title: string;
  author: string | null;
  url: string | null;
  body: string | null;
  community_id: string | null;
  status: string;
};

type DiscussionHeaderActionsProps = {
  discussion: DiscussionRecord;
  originalBody: string;
  intelligenceDomains: IntelligenceDomainOption[];
};

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

export function DiscussionHeaderActions({
  discussion,
  originalBody,
  intelligenceDomains,
}: DiscussionHeaderActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [platform, setPlatform] = useState(discussion.platform);
  const [communityId, setCommunityId] = useState(discussion.community_id ?? "");
  const [title, setTitle] = useState(discussion.title);
  const [author, setAuthor] = useState(discussion.author ?? "");
  const [url, setUrl] = useState(discussion.url ?? "");
  const [body, setBody] = useState(originalBody);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(`/api/discussions/${discussion.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: platform.trim(),
          communityId: communityId || null,
          title: title.trim(),
          author: author.trim(),
          url: url.trim(),
          body: body.trim(),
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to update discussion.");
      }

      setIsEditing(false);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update discussion.",
      );
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/discussions/${discussion.id}`, {
        method: "DELETE",
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to delete discussion.");
      }

      router.push("/discussions");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete discussion.",
      );
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-3 lg:items-end">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setShowDeleteConfirm(false);
            setError(null);
          }}
          className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
        >
          {isEditing ? "Cancel Edit" : "Edit Discussion"}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDeleteConfirm(true);
            setIsEditing(false);
            setError(null);
          }}
          className="rounded-full border border-red-500/30 px-6 py-3 text-sm font-semibold text-red-300 transition hover:border-red-400/50 hover:text-red-200"
        >
          Delete
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-black/30 p-5 lg:text-right">
          <p className="text-sm leading-6 text-white/70">
            Delete this discussion permanently? This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <form
          onSubmit={handleSave}
          className={`w-full max-w-3xl rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6 lg:ml-auto`}
        >
          <h2 className="text-lg font-semibold">Edit Discussion</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Platform
              </span>
              <input
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                required
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Intelligence Domain
              </span>
              <select
                value={communityId}
                onChange={(event) => setCommunityId(event.target.value)}
                className={fieldClassName}
              >
                <option value="">No Intelligence Domain selected</option>
                {intelligenceDomains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className={fieldClassName}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                  Author
                </span>
                <input
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  required
                  className={fieldClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                  Source URL
                </span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required
                  type="url"
                  className={fieldClassName}
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Original Discussion
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                rows={10}
                className={`resize-y leading-6 ${fieldClassName}`}
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
            >
              Save Changes
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
