"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIntelligenceDomainStatus } from "@/lib/intelligenceDomainStatus";
import { IntelligenceDomainStatusBadge } from "@/components/intelligenceDomains/IntelligenceDomainStatusBadge";

export const INTELLIGENCE_DOMAIN_PRIORITY_HELPER =
  "Use 1 for highest priority. Lower numbers indicate higher importance when organizing your domains.";

type IntelligenceDomainRowActionsProps = {
  domain: {
    id: string;
    group_name: string;
    notes: string | null;
    niche: string | null;
    status: string;
    priority: number;
  };
  discussionCount: number;
  layout?: "inline" | "card";
};

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

const compactButtonClassName =
  "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition";

export function IntelligenceDomainRowActions({
  domain,
  discussionCount,
  layout = "card",
}: IntelligenceDomainRowActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState(domain.group_name);
  const [description, setDescription] = useState(domain.notes ?? "");
  const [market, setMarket] = useState(domain.niche ?? "");
  const [status, setStatus] = useState(domain.status || "active");
  const [priority, setPriority] = useState(String(domain.priority || 1));

  const isActive = domain.status === "active";

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/communities/${domain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          market,
          status,
          priority: Number(priority),
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to update Intelligence Domain.");
      }

      setIsEditing(false);
      setMessage("Intelligence Domain updated.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update Intelligence Domain.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus() {
    setIsToggling(true);
    setError(null);
    setMessage(null);

    try {
      const nextStatus = isActive ? "inactive" : "active";
      const response = await fetch(`/api/communities/${domain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to update domain status.");
      }

      setStatus(nextStatus);
      setMessage(
        nextStatus === "active"
          ? "Intelligence Domain enabled."
          : "Intelligence Domain disabled.",
      );
      router.refresh();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update domain status.",
      );
    } finally {
      setIsToggling(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/communities/${domain.id}`, {
        method: "DELETE",
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to delete Intelligence Domain.");
      }

      setShowDeleteConfirm(false);
      setMessage(payload.message || "Intelligence Domain removed.");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete Intelligence Domain.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={layout === "card" ? "w-full" : "min-w-0"}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setShowDeleteConfirm(false);
            setError(null);
          }}
          className={`${compactButtonClassName} border-white/15 text-white/80 hover:border-[var(--athena-orange)]/40 hover:text-white`}
        >
          {isEditing ? "Cancel" : "Edit"}
        </button>

        <button
          type="button"
          onClick={toggleStatus}
          disabled={isToggling}
          className={`${compactButtonClassName} border-white/15 text-white/80 hover:border-[var(--athena-orange)]/40 hover:text-white disabled:opacity-50`}
        >
          {isToggling ? "..." : isActive ? "Disable" : "Enable"}
        </button>

        <Link
          href={`/communities/${domain.id}`}
          className={`${compactButtonClassName} border-white/15 text-white/70 hover:text-white`}
        >
          Open
        </Link>

        {!isEditing && (
          <button
            type="button"
            onClick={() => {
              setShowDeleteConfirm(true);
              setError(null);
            }}
            className={`${compactButtonClassName} border-red-500/30 text-red-300 hover:border-red-400/50`}
          >
            {discussionCount > 0 ? "Remove" : "Delete"}
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="mt-3 rounded-2xl border border-red-500/20 bg-black/30 p-4">
          <p className="text-xs leading-6 text-white/70">
            {discussionCount > 0
              ? `This domain has ${discussionCount} linked discussion${discussionCount === 1 ? "" : "s"}. Athena will disable it instead of deleting historical intelligence.`
              : "Delete this Intelligence Domain permanently? This cannot be undone."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className={`${compactButtonClassName} border-white/15 text-white/70`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className={`${compactButtonClassName} border-red-500/30 bg-red-500/10 text-red-200 disabled:opacity-50`}
            >
              {isDeleting
                ? "Working..."
                : discussionCount > 0
                  ? "Confirm Disable"
                  : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <form
          onSubmit={handleSave}
          className="mt-4 rounded-2xl border border-[var(--athena-border)] bg-black/30 p-4"
        >
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Market / Niche
              </span>
              <input
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                placeholder="e.g. B2B SaaS founders"
                className={fieldClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Description
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className={`resize-y leading-6 ${fieldClassName}`}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                  Status
                </span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                  Priority
                </span>
                <input
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  type="number"
                  min={1}
                  max={5}
                  placeholder="1"
                  className={fieldClassName}
                />
                <span className="text-xs leading-5 text-white/40">
                  {INTELLIGENCE_DOMAIN_PRIORITY_HELPER}
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className="text-xs text-white/40">
              Status: {formatIntelligenceDomainStatus(status)}
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
      {message && !isEditing && (
        <div className="mt-3 text-xs text-emerald-300">{message}</div>
      )}
    </div>
  );
}

type IntelligenceDomainCardProps = {
  domain: IntelligenceDomainRowActionsProps["domain"];
  discussionCount: number;
};

export function IntelligenceDomainCard({
  domain,
  discussionCount,
}: IntelligenceDomainCardProps) {
  return (
    <article className="rounded-[20px] border border-white/10 bg-black/15 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={`/communities/${domain.id}`}
            className="text-lg font-semibold text-white transition hover:text-[var(--athena-orange)]"
          >
            {domain.group_name}
          </Link>

          {domain.notes ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/45">
              {domain.notes}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/45">
            <span className="max-w-full truncate">
              Market:{" "}
              <span className="text-white/70">{domain.niche || "—"}</span>
            </span>
            <IntelligenceDomainStatusBadge status={domain.status} />
            <span>
              Priority:{" "}
              <span className="font-semibold text-[var(--athena-orange)]">
                {domain.priority}
              </span>
            </span>
          </div>
        </div>

        <div className="w-full shrink-0 xl:w-auto xl:min-w-[280px]">
          <IntelligenceDomainRowActions
            domain={domain}
            discussionCount={discussionCount}
            layout="card"
          />
        </div>
      </div>
    </article>
  );
}
