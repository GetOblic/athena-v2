"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { clearLicenseeHandoffBrowserStorage } from "@/lib/licensee/clearHandoffBrowserStorage";
import { SubAccountFallbackIcon } from "@/components/licensee/SubAccountFallbackIcon";
import {
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";

type LicenseeDashboardClientProps = {
  initialItems: LicenseeSubAccountListItem[];
  notice?: string | null;
};

export function LicenseeDashboardClient({
  initialItems,
  notice,
}: LicenseeDashboardClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initialItems);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pinPending, startPinTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] =
    useState<LicenseeSubAccountListItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const emailMatch = item.accountEmail?.toLowerCase().includes(q) ?? false;
      const notesMatch = item.notes.toLowerCase().includes(q);
      const snapshotMatch =
        item.accountSnapshot?.toLowerCase().includes(q) ?? false;
      return nameMatch || emailMatch || notesMatch || snapshotMatch;
    });
  }, [items, query]);

  const pinned = filtered.filter((item) => item.pinned);
  const unpinned = filtered.filter((item) => !item.pinned);

  async function openAthena(organizationId: string) {
    setActionError(null);
    setSuccessMessage(null);
    setOpeningId(organizationId);
    clearLicenseeHandoffBrowserStorage();
    try {
      const response = await fetch("/api/licensee/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open_sub_account",
          organizationId,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        redirectTo?: string;
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok) {
        setActionError(payload.error?.message || "Open Athena failed.");
        setOpeningId(null);
        return;
      }
      clearLicenseeHandoffBrowserStorage();
      window.location.href = payload.redirectTo || "/";
    } catch {
      setActionError("Open Athena failed.");
      setOpeningId(null);
    }
  }

  function togglePin(relationshipId: string, pinned: boolean) {
    setActionError(null);
    setSuccessMessage(null);
    startPinTransition(async () => {
      try {
        const response = await fetch("/api/licensee/sub-accounts/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relationshipId, pinned: !pinned }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          relationshipId?: string;
          pinned?: boolean;
          pinnedAt?: string | null;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok) {
          setActionError(payload.error?.message || "Could not update pin.");
          return;
        }

        setItems((current) => {
          const next = current.map((item) =>
            item.relationshipId === relationshipId
              ? {
                  ...item,
                  pinned: Boolean(payload.pinned),
                  pinnedAt: payload.pinnedAt ?? null,
                }
              : item,
          );
          next.sort((a, b) => {
            if (a.pinned !== b.pinned) {
              return a.pinned ? -1 : 1;
            }
            return a.name.localeCompare(b.name, undefined, {
              sensitivity: "base",
            });
          });
          return next;
        });
        router.refresh();
      } catch {
        setActionError("Could not update pin.");
      }
    });
  }

  async function saveNotes(relationshipId: string, notes: string) {
    setActionError(null);
    setSuccessMessage(null);
    const response = await fetch("/api/licensee/sub-accounts/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationshipId, notes }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      notes?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || "Could not save Master note.");
    }
    setItems((current) =>
      current.map((item) =>
        item.relationshipId === relationshipId
          ? { ...item, notes: payload.notes ?? notes }
          : item,
      ),
    );
    setSuccessMessage("Master note saved.");
  }

  function confirmRemoveSubAccount() {
    if (!confirmRemove) {
      return;
    }
    const target = confirmRemove;
    setActionError(null);
    setSuccessMessage(null);
    startRemoveTransition(async () => {
      try {
        const response = await fetch("/api/licensee/sub-accounts/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relationshipId: target.relationshipId }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok) {
          setActionError(
            payload.error?.message || "Could not remove sub-account.",
          );
          return;
        }

        setItems((current) =>
          current.filter(
            (item) => item.relationshipId !== target.relationshipId,
          ),
        );
        setConfirmRemove(null);
        setSuccessMessage(
          `"${target.name}" was removed from your Master dashboard.`,
        );
        router.refresh();
      } catch {
        setActionError("Could not remove sub-account.");
      }
    });
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="relative w-full lg:max-w-xl">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/35">
            <SearchIcon className="h-5 w-5" />
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search businesses, emails, notes..."
            className="w-full rounded-2xl border border-white/20 bg-[var(--athena-card)] py-4 pl-12 pr-5 text-sm text-white shadow-lg shadow-black/25 outline-none placeholder:text-white/35 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]/40"
          />
        </div>
        <Link
          href="/licensee/sub-accounts/new"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          + Create Sub-account
        </Link>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {actionError}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Create your first Athena sub-account."
          body="Provision a normal Athena workspace and open it from this Master dashboard whenever you need it."
          action={
            <Link
              href="/licensee/sub-accounts/new"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
            >
              + Create Sub-account
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching sub-accounts found."
          body="Try a different business name, email, note, or snapshot phrase."
        />
      ) : (
        <>
          <Section title="Pinned">
            {pinned.length === 0 ? (
              <p className="text-sm text-white/40">No pinned sub-accounts.</p>
            ) : (
              <ul className="space-y-4">
                {pinned.map((item) => (
                  <SubAccountCard
                    key={item.relationshipId}
                    item={item}
                    opening={openingId === item.organizationId}
                    pinDisabled={pinPending}
                    onTogglePin={() =>
                      togglePin(item.relationshipId, item.pinned)
                    }
                    onOpen={() => openAthena(item.organizationId)}
                    onSaveNotes={(notes) =>
                      saveNotes(item.relationshipId, notes)
                    }
                    onRequestRemove={() => setConfirmRemove(item)}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title="All Sub-accounts">
            {unpinned.length === 0 ? (
              <p className="text-sm text-white/40">
                All linked sub-accounts are pinned.
              </p>
            ) : (
              <ul className="space-y-4">
                {unpinned.map((item) => (
                  <SubAccountCard
                    key={item.relationshipId}
                    item={item}
                    opening={openingId === item.organizationId}
                    pinDisabled={pinPending}
                    onTogglePin={() =>
                      togglePin(item.relationshipId, item.pinned)
                    }
                    onOpen={() => openAthena(item.organizationId)}
                    onSaveNotes={(notes) =>
                      saveNotes(item.relationshipId, notes)
                    }
                    onRequestRemove={() => setConfirmRemove(item)}
                  />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {confirmRemove ? (
        <RemoveConfirmDialog
          businessName={confirmRemove.name}
          pending={removePending}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={confirmRemoveSubAccount}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-white/40">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-white/20 bg-[var(--athena-card)] px-6 py-14 text-center shadow-lg shadow-black/20">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
        {body}
      </p>
      {action}
    </div>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx="11"
        cy="11"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16.5 16.5 20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RemoveConfirmDialog({
  businessName,
  pending,
  onCancel,
  onConfirm,
}: {
  businessName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-sub-account-title"
        className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
      >
        <h2
          id="remove-sub-account-title"
          className="text-xl font-semibold text-white"
        >
          Remove &quot;{businessName}&quot;?
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/55">
          This will remove the account from your Master dashboard.
        </p>
        <p className="mt-2 text-sm leading-6 text-white/55">
          The Athena account and its data will NOT be deleted.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:opacity-60"
          >
            {pending ? "Removing…" : "Remove Sub-account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubAccountCard({
  item,
  opening,
  pinDisabled,
  onTogglePin,
  onOpen,
  onSaveNotes,
  onRequestRemove,
}: {
  item: LicenseeSubAccountListItem;
  opening: boolean;
  pinDisabled: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onRequestRemove: () => void;
}) {
  const [draftNotes, setDraftNotes] = useState(item.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const notesDirty = draftNotes !== item.notes;

  useEffect(() => {
    setDraftNotes(item.notes);
  }, [item.notes]);

  return (
    <li className="rounded-[28px] border border-white/15 bg-[var(--athena-card)] p-6 shadow-lg shadow-black/25">
      <div className="flex flex-col gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/5">
            {item.logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.logoPreviewUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <SubAccountFallbackIcon className="h-7 w-7 text-white/45" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-semibold tracking-tight text-white">
              {item.name}
            </h3>
            {item.accountEmail ? (
              <div className="mt-1 truncate text-sm text-white/45">
                {item.accountEmail}
              </div>
            ) : null}
          </div>
        </div>

        {item.accountSnapshot ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
              Account Snapshot
            </div>
            <p className="mt-2 text-sm leading-6 text-white/55">
              {item.accountSnapshot}
            </p>
          </div>
        ) : null}

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
            Master Note
            <textarea
              value={draftNotes}
              onChange={(event) => {
                setDraftNotes(event.target.value);
                setNotesError(null);
              }}
              rows={3}
              maxLength={LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH}
              placeholder="Private note for this sub-account…"
              className="mt-2 w-full resize-y rounded-2xl border border-white/12 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)]/70"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-white/30">
              {draftNotes.length}/{LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH}
              {notesDirty ? " · unsaved" : ""}
            </span>
            <button
              type="button"
              disabled={savingNotes || !notesDirty}
              onClick={() => {
                setSavingNotes(true);
                setNotesError(null);
                void onSaveNotes(draftNotes)
                  .catch((error: unknown) => {
                    setNotesError(
                      error instanceof Error
                        ? error.message
                        : "Could not save Master note.",
                    );
                  })
                  .finally(() => setSavingNotes(false));
              }}
              className="rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
            >
              {savingNotes ? "Saving…" : "Save note"}
            </button>
          </div>
          {notesError ? (
            <p className="mt-2 text-xs text-red-300">{notesError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pinDisabled}
              onClick={onTogglePin}
              aria-label={item.pinned ? "Unpin sub-account" : "Pin sub-account"}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <span className="text-[var(--athena-orange)]">
                {item.pinned ? "★" : "☆"}
              </span>
              {item.pinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              onClick={onRequestRemove}
              className="inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-sm text-white/55 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
            >
              Remove
            </button>
          </div>

          <button
            type="button"
            disabled={opening}
            onClick={onOpen}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--athena-orange)] px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-orange-500/25 transition hover:opacity-90 disabled:opacity-60"
          >
            {opening ? "Opening…" : "Open Athena →"}
          </button>
        </div>
      </div>
    </li>
  );
}
