"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  formatIntelligenceDomainStatus,
  normalizeIntelligenceDomainStatus,
} from "@/lib/intelligenceDomainStatus";
import { INTELLIGENCE_DOMAIN_PRIORITY_HELPER } from "@/components/intelligenceDomains/IntelligenceDomainRowActions";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";

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
  messages?: TenantMessages["intelligenceDomains"];
};

const headerButtonClassName =
  "rounded-full border px-4 py-2.5 text-xs font-semibold transition sm:px-5 sm:py-3 sm:text-sm";

const fieldClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25";

export function IntelligenceDomainHeaderActions({
  domain,
  discussionCount,
  messages,
}: IntelligenceDomainHeaderActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateFailed =
    messages?.updateFailed ?? "Failed to update Intelligence Domain.";
  const statusUpdateFailed =
    messages?.statusUpdateFailed ?? "Failed to update domain status.";
  const deleteFailed =
    messages?.deleteFailed ?? "Failed to delete Intelligence Domain.";
  const statusActive = messages?.statusActive ?? "Active";
  const statusInactive = messages?.statusInactive ?? "Inactive";

  const [name, setName] = useState(domain.group_name);
  const [description, setDescription] = useState(domain.notes ?? "");
  const [market, setMarket] = useState(domain.niche ?? "");
  const [status, setStatus] = useState(domain.status || "active");
  const [priority, setPriority] = useState(String(domain.priority));
  const currentStatusLabel =
    normalizeIntelligenceDomainStatus(status) === "active"
      ? statusActive
      : statusInactive;

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
        throw new Error(payload.error || updateFailed);
      }

      setIsEditing(false);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : updateFailed,
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
        throw new Error(payload.error || statusUpdateFailed);
      }

      router.refresh();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : statusUpdateFailed,
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
        throw new Error(payload.error || deleteFailed);
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
        deleteError instanceof Error ? deleteError.message : deleteFailed,
      );
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-3 xl:max-w-xl xl:items-end">
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setShowDeleteConfirm(false);
            setError(null);
          }}
          className={`${headerButtonClassName} border-white/15 text-white/80 hover:border-[var(--athena-orange)]/40 hover:text-white`}
        >
          {isEditing
            ? (messages?.detail.cancelEdit ?? "Cancel Edit")
            : (messages?.detail.editDomain ?? "Edit Domain")}
        </button>

        <button
          type="button"
          onClick={toggleStatus}
          className={`${headerButtonClassName} border-white/15 text-white/80 hover:border-[var(--athena-orange)]/40 hover:text-white`}
        >
          {domain.status === "active"
            ? (messages?.disable ?? "Disable")
            : (messages?.enable ?? "Enable")}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDeleteConfirm(true);
            setIsEditing(false);
            setError(null);
          }}
          className={`${headerButtonClassName} border-red-500/30 text-red-300 hover:border-red-400/50`}
        >
          {messages?.delete ?? "Delete"}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-black/30 p-5 lg:text-right">
          <p className="text-sm leading-6 text-white/70">
            {discussionCount > 0
              ? interpolateTenantMessage(
                  discussionCount === 1
                    ? (messages?.detail.disableConfirmLinkedOne ??
                      "This domain has {count} linked discussion. Athena will disable it to preserve linked intelligence.")
                    : (messages?.detail.disableConfirmLinkedMany ??
                      "This domain has {count} linked discussions. Athena will disable it to preserve linked intelligence."),
                  { count: discussionCount },
                )
              : (messages?.deleteConfirmEmpty ??
                "Delete this Intelligence Domain permanently? This cannot be undone.")}
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70"
            >
              {messages?.cancel ?? "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"
            >
              {isDeleting
                ? (messages?.working ?? "Working...")
                : discussionCount > 0
                  ? (messages?.confirmDisable ?? "Confirm Disable")
                  : (messages?.confirmDelete ?? "Confirm Delete")}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <form
          onSubmit={handleSave}
          className="w-full max-w-3xl rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 lg:ml-auto"
        >
          <h2 className="text-lg font-semibold">
            {messages?.editTitle ?? "Edit Intelligence Domain"}
          </h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                {messages?.name ?? "Name"}
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
                {messages?.description ?? "Description"}
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
                {messages?.marketNiche ?? "Market / Niche"}
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
                  {messages?.status ?? "Status"}
                </span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="active">{statusActive}</option>
                  <option value="inactive">{statusInactive}</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
                  {messages?.priority ?? "Priority"}
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
                  {messages?.priorityHelp ?? INTELLIGENCE_DOMAIN_PRIORITY_HELPER}
                </span>
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">
              {interpolateTenantMessage(
                messages?.detail.currentStatus ?? "Current status: {status}",
                {
                  status:
                    currentStatusLabel ||
                    formatIntelligenceDomainStatus(status),
                },
              )}
            </span>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSaving
                ? (messages?.saving ?? "Saving...")
                : (messages?.saveChanges ?? "Save Changes")}
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
