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
import { computeAccountReadiness } from "@/services/licensee/licenseeAccountReadiness";
import {
  LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH,
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  resolveLicenseeSubAccountTitle,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";

type LicenseeDashboardClientProps = {
  initialItems: LicenseeSubAccountListItem[];
  notice?: string | null;
};

function sortSubAccounts(
  items: LicenseeSubAccountListItem[],
): LicenseeSubAccountListItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return resolveLicenseeSubAccountTitle(a).localeCompare(
      resolveLicenseeSubAccountTitle(b),
      undefined,
      { sensitivity: "base" },
    );
  });
}

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

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => {
      const titleMatch = resolveLicenseeSubAccountTitle(item)
        .toLowerCase()
        .includes(q);
      const nameMatch = item.name.toLowerCase().includes(q);
      const displayNameMatch =
        item.displayName?.toLowerCase().includes(q) ?? false;
      const emailMatch = item.accountEmail?.toLowerCase().includes(q) ?? false;
      const notesMatch = item.notes.toLowerCase().includes(q);
      const snapshotMatch =
        item.accountSnapshot?.toLowerCase().includes(q) ?? false;
      return (
        titleMatch ||
        nameMatch ||
        displayNameMatch ||
        emailMatch ||
        notesMatch ||
        snapshotMatch
      );
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

        setItems((current) =>
          sortSubAccounts(
            current.map((item) =>
              item.relationshipId === relationshipId
                ? {
                    ...item,
                    pinned: Boolean(payload.pinned),
                    pinnedAt: payload.pinnedAt ?? null,
                  }
                : item,
            ),
          ),
        );
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

  async function saveDisplayName(relationshipId: string, displayName: string) {
    setActionError(null);
    setSuccessMessage(null);
    const response = await fetch("/api/licensee/sub-accounts/display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationshipId, displayName }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      displayName?: string | null;
      error?: { message?: string };
    };
    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error?.message || "Could not save Master display name.",
      );
    }
    setItems((current) =>
      sortSubAccounts(
        current.map((item) =>
          item.relationshipId === relationshipId
            ? { ...item, displayName: payload.displayName ?? null }
            : item,
        ),
      ),
    );
    setSuccessMessage("Master display name saved.");
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
          `"${resolveLicenseeSubAccountTitle(target)}" was removed from your Master dashboard.`,
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
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/45">
            <SearchIcon className="h-5 w-5" />
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search businesses, emails, notes..."
            className="w-full rounded-2xl border border-white/30 bg-[#161922] py-4 pl-12 pr-5 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] outline-none placeholder:text-white/40 focus:border-[var(--athena-orange)] focus:ring-2 focus:ring-[var(--athena-orange)]/35"
          />
        </div>
        <Link
          href="/licensee/sub-accounts/new"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
        >
          + Create Sub-account
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/licensee/estimate"
          className="block rounded-2xl border border-[var(--athena-border)] bg-black/20 px-5 py-5 transition hover:border-white/20 hover:bg-white/5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-white">
                Athena Estimate
              </div>
              <p className="mt-1 text-sm leading-6 text-white/50">
                Know what to charge your client — using Athena’s knowledge of
                their business.
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium text-[var(--athena-orange)]">
              Open →
            </span>
          </div>
        </Link>

        <Link
          href="/licensee/quote"
          className="block rounded-2xl border border-[var(--athena-border)] bg-black/20 px-5 py-5 transition hover:border-white/20 hover:bg-white/5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-white">Athena Quote</div>
              <p className="mt-1 text-sm leading-6 text-white/50">
                Submit client work for private GetOblic fulfillment pricing.
              </p>
            </div>
            <span className="shrink-0 text-sm font-medium text-[var(--athena-orange)]">
              Open →
            </span>
          </div>
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
              <ul className="space-y-5">
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
                    onSaveDisplayName={(displayName) =>
                      saveDisplayName(item.relationshipId, displayName)
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
              <ul className="space-y-5">
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
                    onSaveDisplayName={(displayName) =>
                      saveDisplayName(item.relationshipId, displayName)
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
          businessName={resolveLicenseeSubAccountTitle(confirmRemove)}
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
  onSaveDisplayName,
  onRequestRemove,
}: {
  item: LicenseeSubAccountListItem;
  opening: boolean;
  pinDisabled: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onSaveDisplayName: (displayName: string) => Promise<void>;
  onRequestRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draftNotes, setDraftNotes] = useState(item.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(
    item.displayName ?? "",
  );
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const notesDirty = draftNotes !== item.notes;
  const title = resolveLicenseeSubAccountTitle(item);
  const showOriginalName =
    Boolean(item.displayName?.trim()) &&
    item.displayName?.trim() !== item.name.trim();
  const readiness = computeAccountReadiness({
    brainReady: item.metrics.brainReady,
    websiteIntelligenceReady: item.metrics.websiteIntelligenceReady,
    seoReady: item.metrics.seoReady,
    adsReady: item.metrics.adsReady,
    hasPersonas: item.metrics.personaCount > 0,
    hasProspects: item.metrics.prospectCount > 0,
  });
  const readinessPercent = item.metrics.accountReadinessPercent;

  useEffect(() => {
    setDraftNotes(item.notes);
  }, [item.notes]);

  useEffect(() => {
    setDraftDisplayName(item.displayName ?? "");
    setEditingName(false);
  }, [item.displayName]);

  return (
    <li
      className={`rounded-[28px] border bg-[#141820] p-6 shadow-[0_14px_40px_rgba(0,0,0,0.38)] transition ${
        expanded
          ? "border-white/28 ring-1 ring-white/10"
          : "border-white/22"
      }`}
    >
      <div className="flex flex-col gap-5">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/[0.04]">
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
                {title}
              </h3>
              {showOriginalName ? (
                <div className="mt-1 truncate text-sm text-white/40">
                  {item.name}
                </div>
              ) : null}
              {item.accountEmail ? (
                <div className="mt-1 truncate text-sm text-white/50">
                  {item.accountEmail}
                </div>
              ) : null}
            </div>
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

        <AccountReadinessBar percent={readinessPercent} />

        <div className="flex flex-wrap gap-2">
          <StatusChip label="Brain" ready={item.metrics.brainReady} />
          <StatusChip label="SEO" ready={item.metrics.seoReady} />
          <StatusChip label="Ads" ready={item.metrics.adsReady} />
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <MetricStat label="Prospects" value={item.metrics.prospectCount} />
          <MetricStat
            label="Discussions"
            value={item.metrics.discussionCount}
          />
          <MetricStat label="Personas" value={item.metrics.personaCount} />
        </div>

        <div className="flex flex-col gap-3 border-t border-white/12 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
              Last Visit
            </div>
            <div className="mt-1.5 text-sm text-white/70">
              {formatLastVisit(item.metrics.lastVisitedAt)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/15 px-3.5 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
            {expanded ? "Hide details" : "Details"}
          </button>
        </div>

        {expanded ? (
          <div className="space-y-5 border-t border-white/12 pt-5">
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
                Account Readiness
              </div>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Deterministic workspace completeness from existing operational
                signals — not a business health score.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {readiness.dimensions.map((dimension) => (
                  <li
                    key={dimension.key}
                    className="flex items-center gap-2 text-sm text-white/60"
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        dimension.ready
                          ? "bg-emerald-400"
                          : "bg-white/25"
                      }`}
                      aria-hidden="true"
                    />
                    {dimension.label}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
                  Master Display Name
                </div>
                {!editingName ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDisplayName(item.displayName ?? "");
                      setEditingName(true);
                      setDisplayNameError(null);
                    }}
                    className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
              {!editingName ? (
                <p className="mt-2 text-sm text-white/65">
                  {item.displayName?.trim() || "Using Athena account name"}
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  <input
                    type="text"
                    value={draftDisplayName}
                    maxLength={LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH}
                    onChange={(event) => {
                      setDraftDisplayName(event.target.value);
                      setDisplayNameError(null);
                    }}
                    placeholder={item.name}
                    className="w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)]/70"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-white/30">
                      {draftDisplayName.trim().length}/
                      {LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingDisplayName}
                        onClick={() => {
                          setEditingName(false);
                          setDraftDisplayName(item.displayName ?? "");
                          setDisplayNameError(null);
                        }}
                        className="rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingDisplayName}
                        onClick={() => {
                          setSavingDisplayName(true);
                          setDisplayNameError(null);
                          void onSaveDisplayName(draftDisplayName)
                            .then(() => setEditingName(false))
                            .catch((error: unknown) => {
                              setDisplayNameError(
                                error instanceof Error
                                  ? error.message
                                  : "Could not save Master display name.",
                              );
                            })
                            .finally(() => setSavingDisplayName(false));
                        }}
                        className="rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                      >
                        {savingDisplayName ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  {displayNameError ? (
                    <p className="text-xs text-red-300">{displayNameError}</p>
                  ) : null}
                </div>
              )}
            </div>

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
                  className="mt-2 w-full resize-y rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)]/70"
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

            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                disabled={pinDisabled}
                onClick={onTogglePin}
                aria-label={
                  item.pinned ? "Unpin sub-account" : "Pin sub-account"
                }
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
          </div>
        ) : null}
      </div>
    </li>
  );
}

function AccountReadinessBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/40">
          Account Readiness
        </div>
        <div className="text-sm font-semibold tabular-nums text-white/85">
          {clamped}%
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-emerald-300/90 transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function StatusChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium tracking-wide ${
        ready
          ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
          : "border-white/12 bg-white/[0.03] text-white/45"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          ready ? "bg-emerald-400" : "bg-white/30"
        }`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function MetricStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="text-lg font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
    </div>
  );
}

function formatLastVisit(iso: string | null): string {
  if (!iso) {
    return "Never visited";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Never visited";
  }

  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDelta = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000,
  );

  if (dayDelta === 0) {
    return `Today · ${time}`;
  }
  if (dayDelta === 1) {
    return `Yesterday · ${time}`;
  }

  const dayLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${dayLabel} · ${time}`;
}
