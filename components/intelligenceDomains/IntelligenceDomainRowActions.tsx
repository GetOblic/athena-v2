"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIntelligenceDomainStatus } from "@/lib/intelligenceDomainStatus";

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
};

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

export function IntelligenceDomainRowActions({
  domain,
  discussionCount,
}: IntelligenceDomainRowActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState(domain.group_name);
  const [description, setDescription] = useState(domain.notes ?? "");
  const [market, setMarket] = useState(domain.niche ?? "");
  const [status, setStatus] = useState(domain.status || "active");
  const [priority, setPriority] = useState(String(domain.priority));

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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setShowDeleteConfirm(false);
            setError(null);
          }}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
        >
          {isEditing ? "Cancel" : "Edit"}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDeleteConfirm(true);
            setIsEditing(false);
            setError(null);
          }}
          className="rounded-full border border-red-500/30 px-4 py-2 text-xs font-semibold text-red-300 transition hover:border-red-400/50"
        >
          {discussionCount > 0 ? "Disable" : "Delete"}
        </button>

        <Link
          href={`/communities/${domain.id}`}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 transition hover:text-white"
        >
          Open
        </Link>
      </div>

      {showDeleteConfirm && (
        <div className="rounded-2xl border border-red-500/20 bg-black/30 p-4">
          <p className="text-xs leading-6 text-white/70">
            {discussionCount > 0
              ? `This domain has ${discussionCount} linked discussion${discussionCount === 1 ? "" : "s"}. Athena will disable it instead of deleting historical intelligence.`
              : "Delete this Intelligence Domain permanently? This cannot be undone."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-full bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-200 disabled:opacity-50"
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
          className="rounded-2xl border border-[var(--athena-border)] bg-black/30 p-4"
        >
          <div className="grid gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Domain name"
              className={fieldClassName}
            />
            <input
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              placeholder="Market / niche"
              className={fieldClassName}
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Description"
              className={`resize-y leading-6 ${fieldClassName}`}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={fieldClassName}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                type="number"
                min={1}
                max={5}
                className={fieldClassName}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">
              Status: {formatIntelligenceDomainStatus(status)}
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-[var(--athena-orange)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-xs text-red-300">{error}</div>}
      {message && <div className="text-xs text-emerald-300">{message}</div>}
    </div>
  );
}
