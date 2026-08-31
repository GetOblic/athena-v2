"use client";

import { useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type IntelligenceDomainOption = {
  id: string;
  name: string;
};

type CaptureDiscussionFormProps = {
  intelligenceDomains: IntelligenceDomainOption[];
  messages: TenantMessages["inbox"];
};

type ImportResponse = {
  ok?: boolean;
  success?: boolean;
  accepted?: boolean;
  discussionId?: string;
  discussion?: { id?: string };
  jobId?: string;
  status?: string;
  message?: string;
  error?: string | { code?: string; message?: string };
};

const fieldClassName =
  "rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

function errorMessageFromPayload(
  payload: ImportResponse,
  fallback: string,
): string {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (
    payload.error &&
    typeof payload.error === "object" &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

export function CaptureDiscussionForm({
  intelligenceDomains,
  messages,
}: CaptureDiscussionFormProps) {
  const [domainId, setDomainId] = useState("");
  const [platform, setPlatform] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    discussionId?: string;
  } | null>(null);

  const canSubmit =
    platform.trim() &&
    title.trim() &&
    author.trim() &&
    url.trim() &&
    body.trim();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/ingestion/facebook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          communityId: domainId || null,
          platform: platform.trim(),
          title: title.trim(),
          author: author.trim(),
          url: url.trim(),
          body: body.trim(),
        }),
      });

      const payload = await parseJsonResponse<ImportResponse>(response, {
        unexpectedMessage: messages.unexpectedResponse,
      });

      const discussionId =
        payload.discussionId ?? payload.discussion?.id ?? undefined;

      if (!response.ok || (!payload.success && !payload.ok)) {
        throw new Error(errorMessageFromPayload(payload, messages.importFailed));
      }

      if (!discussionId) {
        throw new Error(messages.missingId);
      }

      setResult({
        ok: true,
        message: payload.message ?? messages.importSuccess,
        discussionId,
      });

      setPlatform("");
      setTitle("");
      setAuthor("");
      setUrl("");
      setBody("");
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error ? error.message : messages.importFailed,
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
            {messages.domainLabel}
          </span>
          <select
            value={domainId}
            onChange={(event) => setDomainId(event.target.value)}
            className={fieldClassName}
          >
            <option value="">{messages.domainNone}</option>
            {intelligenceDomains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
          <span className="text-xs leading-5 text-white/40">
            {messages.domainHelp}
          </span>
        </label>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              {messages.platform}
            </span>
            <input
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              required
              placeholder={messages.platformPlaceholder}
              className={fieldClassName}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              {messages.titleField}
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              placeholder={messages.titlePlaceholder}
              className={fieldClassName}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              {messages.author}
            </span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              required
              placeholder={messages.authorPlaceholder}
              className={fieldClassName}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
              {messages.sourceUrl}
            </span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              type="url"
              placeholder={messages.urlPlaceholder}
              className={fieldClassName}
            />
          </label>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
            {messages.discussion}
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={14}
            placeholder={messages.discussionPlaceholder}
            className={`resize-y leading-6 ${fieldClassName}`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? messages.importing : messages.importCta}
          </button>

          {result && (
            <div
              className={
                result.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"
              }
            >
              {result.message}
              {result.discussionId ? (
                <>
                  {" "}
                  <a
                    href={`/discussions/${result.discussionId}`}
                    className="text-[var(--athena-orange)] underline"
                  >
                    {messages.openDiscussion}
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
