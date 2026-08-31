"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnalyzeDiscussionButton } from "@/components/discussions/AnalyzeDiscussionButton";
import { ThinkDifferentlyButton } from "@/components/discussions/ThinkDifferentlyButton";
import {
  ConfirmDeleteControl,
  type ConfirmDeleteChrome,
} from "@/components/ui/ConfirmDeleteControl";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { DiscussionDetailChrome } from "@/lib/discussionExecutiveChrome";

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
  messages?: DiscussionDetailChrome;
  deleteChrome?: ConfirmDeleteChrome;
};

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

export function DiscussionHeaderActions({
  discussion,
  originalBody,
  intelligenceDomains,
  messages,
  deleteChrome,
}: DiscussionHeaderActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
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
        throw new Error(
          payload.error || messages?.updateFailed || "Failed to update discussion.",
        );
      }

      setIsEditing(false);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : messages?.updateFailed || "Failed to update discussion.",
      );
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-3 lg:items-end">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <AnalyzeDiscussionButton
          discussionId={discussion.id}
          label={messages?.generateIntelligence ?? "Generate Intelligence"}
          generatingLabel={messages?.generatingIntelligence}
          completedLabel={messages?.intelligenceGenerated}
          compact
        />

        <ThinkDifferentlyButton
          compact
          label={messages?.thinkDifferently}
          thinkingLabel={messages?.thinkingDifferently}
          completedLabel={messages?.thoughtDifferently}
        />

        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setError(null);
          }}
          className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
        >
          {isEditing
            ? (messages?.cancelEdit ?? "Cancel Edit")
            : (messages?.editDiscussion ?? "Edit Discussion")}
        </button>

        <ConfirmDeleteControl
          confirmMessage={
            messages?.deleteConfirm ??
            "Delete this discussion permanently? This cannot be undone."
          }
          deleteUrl={`/api/discussions/${discussion.id}`}
          redirectTo="/discussions"
          isSuccessPayload={(payload) => Boolean(payload.success)}
          errorFallback={
            messages?.deleteFailed ?? "Failed to delete discussion."
          }
          dismissKey={isEditing}
          chrome={deleteChrome}
        />
      </div>

      {isEditing && (
        <form
          onSubmit={handleSave}
          className={`w-full max-w-3xl rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6 lg:ml-auto`}
        >
          <h2 className="text-lg font-semibold">
            {messages?.editDiscussion ?? "Edit Discussion"}
          </h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                {messages?.labelPlatform ?? "Platform"}
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
                {messages?.labelDomain ?? "Intelligence Domain"}
              </span>
              <select
                value={communityId}
                onChange={(event) => setCommunityId(event.target.value)}
                className={fieldClassName}
              >
                <option value="">
                  {messages?.noDomainSelected ??
                    "No Intelligence Domain selected"}
                </option>
                {intelligenceDomains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                {messages?.labelTitle ?? "Title"}
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
                  {messages?.labelAuthor ?? "Author"}
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
                  {messages?.labelSourceUrl ?? "Source URL"}
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
                {messages?.labelOriginalDiscussion ?? "Original Discussion"}
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
              {messages?.saveChanges ?? "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
