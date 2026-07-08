"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIntelligenceDomainStatus } from "@/lib/intelligenceDomainStatus";

type IntelligenceDomainHeaderActionsProps = {
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

export function IntelligenceDomainHeaderActions({
  domain,
  discussionCount,
}: IntelligenceDomainHeaderActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(domain.group_name);
  const [description, setDescription] = useState(domain.notes ?? "");
  const [market, setMarket] = useState(domain.niche ?? "");
  const [status, setStatus] = useState(domain.status || "active");
  const [priority, setPriority] = useState(String(domain.priority));

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

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
    setError(null);

    try {
      const nextStatus = domain.status === "active" ? "inactive" : "active";
      const response = await fetch(`/api/communities/${domain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to update domain status.");
      }

      router.refresh();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update domain status.",
      );
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/communities/${domain.id}`, {
        method: "DELETE",
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to delete Intelligence Domain.");
      }

      if (payload.softDeleted) {
        setShowDeleteConfirm(false);
        router.refresh();
        return;
      }

      router.push("/intelligence-domains");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete Intelligence Domain.",
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
          {isEditing ? "Cancel Edit" : "Edit Intelligence Domain"}
        </button>

        <button
          type="button"
          onClick={toggleStatus}
          className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
        >
          {domain.status === "active" ? "Disable" : "Enable"}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDeleteConfirm(true);
            setIsEditing(false);
            setError(null);
          }}
          className="rounded-full border border-red-500/30 px-6 py-3 text-sm font-semibold text-red-300 transition hover:border-red-400/50"
        >
          Delete
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-black/30 p-5 lg:text-right">
          <p className="text-sm leading-6 text-white/70">
            {discussionCount > 0
              ? `This domain has ${discussionCount} linked discussion${discussionCount === 1 ? "" : "s"}. Athena will disable it to preserve linked intelligence.`
              : "Delete this Intelligence Domain permanently? This cannot be undone."}
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
          className="w-full max-w-3xl rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 lg:ml-auto"
        >
          <h2 className="text-lg font-semibold">Edit Intelligence Domain</h2>

          <div className="mt-5 grid gap-4">
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
                Description
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className={`resize-y leading-6 ${fieldClassName}`}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                Market / Niche
              </span>
              <input
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                className={fieldClassName}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
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
                  className={fieldClassName}
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">
              Current status: {formatIntelligenceDomainStatus(status)}
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
