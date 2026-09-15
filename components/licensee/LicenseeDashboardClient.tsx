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
import {
  Calculator,
  FileText,
  Plus,
  Search,
} from "lucide-react";
import { clearLicenseeHandoffBrowserStorage } from "@/lib/licensee/clearHandoffBrowserStorage";
import {
  getLicenseeLocalization,
  type LicenseeMessages,
} from "@/lib/licensee/getLicenseeLocalization";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  restoreToProspectLocalizedMessage,
  licenseeErrorMessage,
} from "@/lib/licensee/licenseeErrorPresentation";
import {
  formatLicenseeLastVisit,
  LICENSEE_EMPTY_STATE_CLASS,
  LICENSEE_ERROR_NOTICE_CLASS,
  LICENSEE_ESTIMATE_CARD_CLASS,
  LICENSEE_ICON_WELL,
  LICENSEE_OWN_COMPANY_CARD_CLASS,
  LICENSEE_PRIMARY_CTA_CLASS,
  LICENSEE_QUOTE_CARD_CLASS,
  LICENSEE_SEARCH_INPUT_CLASS,
  LICENSEE_SECTION_HEADER_CLASS,
  LICENSEE_SUB_ACCOUNT_CARD_CLASS,
  LICENSEE_SUCCESS_NOTICE_CLASS,
  LICENSEE_WARNING_NOTICE_CLASS,
} from "@/lib/licensee/licenseeDashboardPresentation";
import { SubAccountFallbackIcon } from "@/components/licensee/SubAccountFallbackIcon";
import { computeAccountReadiness } from "@/services/licensee/licenseeAccountReadiness";
import {
  LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH,
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  resolveLicenseeSubAccountTitle,
  sortLicenseeSubAccountsForDashboard,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";

export type LicenseeDashboardSubAccountItem = LicenseeSubAccountListItem & {
  conversionManaged: boolean;
};

export type LicenseeSubAccountRemovalKind = "none" | "remove" | "restore";

export const RESTORE_TO_PROSPECT_LIFECYCLE_ACTION =
  "inline-flex items-center justify-center rounded-xl border border-[var(--athena-orange)]/45 bg-[var(--athena-orange)]/12 px-4 py-2.5 text-sm font-semibold text-[var(--athena-orange)] transition hover:border-[var(--athena-orange)]/70 hover:bg-[var(--athena-orange)]/22 disabled:opacity-50";

export function licenseeSubAccountRemovalKind(item: {
  isOwnCompany: boolean;
  conversionManaged: boolean;
}): LicenseeSubAccountRemovalKind {
  if (item.isOwnCompany) {
    return "none";
  }
  if (item.conversionManaged) {
    return "restore";
  }
  return "remove";
}

export function restoreToProspectUserMessage(
  status: number,
  messages: LicenseeMessages = getLicenseeLocalization("en").messages,
): string {
  return restoreToProspectLocalizedMessage(status, messages);
}

type LicenseeDashboardClientProps = {
  initialItems: LicenseeDashboardSubAccountItem[];
  notice?: string | null;
  messages?: LicenseeMessages;
  locale?: string;
};

function sortSubAccounts(
  items: LicenseeDashboardSubAccountItem[],
): LicenseeDashboardSubAccountItem[] {
  return sortLicenseeSubAccountsForDashboard(
    items,
  ) as LicenseeDashboardSubAccountItem[];
}

export function LicenseeDashboardClient({
  initialItems,
  notice,
  messages = getLicenseeLocalization("en").messages,
  locale = "en-US",
}: LicenseeDashboardClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initialItems);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pinPending, startPinTransition] = useTransition();
  const [designatePending, startDesignateTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();
  const [restorePending, startRestoreTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] =
    useState<LicenseeDashboardSubAccountItem | null>(null);
  const [confirmRestore, setConfirmRestore] =
    useState<LicenseeDashboardSubAccountItem | null>(null);

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

  const hasOwnCompany = items.some((item) => item.isOwnCompany);
  const ownCompany = filtered.filter((item) => item.isOwnCompany);
  const pinned = filtered.filter((item) => item.pinned && !item.isOwnCompany);
  const unpinned = filtered.filter((item) => !item.pinned && !item.isOwnCompany);

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
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !payload.ok) {
        setActionError(
          licenseeErrorMessage(
            messages,
            payload.error?.code,
            messages.errors.openAthenaFailed,
          ),
        );
        setOpeningId(null);
        return;
      }
      clearLicenseeHandoffBrowserStorage();
      window.location.href = payload.redirectTo || "/";
    } catch {
      setActionError(messages.errors.openAthenaFailed);
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
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !payload.ok) {
          setActionError(
            licenseeErrorMessage(
              messages,
              payload.error?.code,
              messages.errors.pinFailed,
            ),
          );
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
        setActionError(messages.errors.pinFailed);
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
      error?: { code?: string; message?: string };
    };
    if (!response.ok || !payload.ok) {
      throw new Error(
        licenseeErrorMessage(
          messages,
          payload.error?.code,
          messages.errors.noteSaveFailed,
        ),
      );
    }
    setItems((current) =>
      current.map((item) =>
        item.relationshipId === relationshipId
          ? { ...item, notes: payload.notes ?? notes }
          : item,
      ),
    );
    setSuccessMessage(messages.notices.noteSaved);
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
      error?: { code?: string; message?: string };
    };
    if (!response.ok || !payload.ok) {
      throw new Error(
        licenseeErrorMessage(
          messages,
          payload.error?.code,
          messages.errors.displayNameSaveFailed,
        ),
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
    setSuccessMessage(messages.notices.displayNameSaved);
  }

  function designateOwnCompany(relationshipId: string) {
    setActionError(null);
    setSuccessMessage(null);
    startDesignateTransition(async () => {
      try {
        const response = await fetch("/api/licensee/sub-accounts/own-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relationshipId }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          organizationId?: string;
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !payload.ok) {
          setActionError(
            licenseeErrorMessage(
              messages,
              payload.error?.code,
              messages.errors.setMyCompanyFailed,
            ),
          );
          return;
        }

        setItems((current) =>
          sortSubAccounts(
            current.map((item) => ({
              ...item,
              isOwnCompany: item.relationshipId === relationshipId,
            })),
          ),
        );
        setSuccessMessage(messages.notices.myCompanyDesignated);
        router.refresh();
      } catch {
        setActionError(messages.errors.setMyCompanyFailed);
      }
    });
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
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !payload.ok) {
          setActionError(
            licenseeErrorMessage(
              messages,
              payload.error?.code,
              messages.errors.removeFailed,
            ),
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
          interpolateTenantMessage(messages.notices.removedFromDashboard, {
            name: resolveLicenseeSubAccountTitle(target),
          }),
        );
        router.refresh();
      } catch {
        setActionError(messages.errors.removeFailed);
      }
    });
  }

  function confirmRestoreToProspect() {
    if (!confirmRestore || restorePending) {
      return;
    }
    const target = confirmRestore;
    setActionError(null);
    setSuccessMessage(null);
    startRestoreTransition(async () => {
      try {
        const response = await fetch(
          "/api/licensee/sub-accounts/restore-to-prospect",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              relationshipId: target.relationshipId,
            }),
          },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok) {
          setActionError(restoreToProspectUserMessage(response.status, messages));
          return;
        }

        setConfirmRestore(null);
        setSuccessMessage(
          interpolateTenantMessage(messages.notices.movedBackToProspects, {
            name: resolveLicenseeSubAccountTitle(target),
          }),
        );
        router.refresh();
      } catch {
        setActionError(restoreToProspectUserMessage(500, messages));
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="relative w-full lg:max-w-xl">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/45">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={messages.dashboard.searchPlaceholder}
            className={LICENSEE_SEARCH_INPUT_CLASS}
          />
        </div>
        <Link
          href="/licensee/sub-accounts/new"
          className={LICENSEE_PRIMARY_CTA_CLASS}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {items.length === 0
            ? messages.dashboard.createCompanyAccount
            : messages.dashboard.createSubAccount}
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/licensee/estimate" className={LICENSEE_ESTIMATE_CARD_CLASS}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl ${LICENSEE_ICON_WELL.cyan}`}
                aria-hidden="true"
              >
                <Calculator size={18} />
              </span>
              <div>
                <div className="text-base font-semibold text-white">
                  {messages.dashboard.estimateTitle}
                </div>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  {messages.dashboard.estimateDescription}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium text-[var(--athena-orange)]">
              {messages.common.open}
            </span>
          </div>
        </Link>

        <Link href="/licensee/quote" className={LICENSEE_QUOTE_CARD_CLASS}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl ${LICENSEE_ICON_WELL.violet}`}
                aria-hidden="true"
              >
                <FileText size={18} />
              </span>
              <div>
                <div className="text-base font-semibold text-white">
                  {messages.dashboard.quoteTitle}
                </div>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  {messages.dashboard.quoteDescription}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium text-[var(--athena-orange)]">
              {messages.common.open}
            </span>
          </div>
        </Link>
      </div>

      {notice ? (
        <div className={LICENSEE_SUCCESS_NOTICE_CLASS}>{notice}</div>
      ) : null}

      {successMessage ? (
        <div className={LICENSEE_SUCCESS_NOTICE_CLASS}>{successMessage}</div>
      ) : null}

      {actionError ? (
        <div className={LICENSEE_ERROR_NOTICE_CLASS}>{actionError}</div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={messages.dashboard.emptyTitle}
          body={messages.dashboard.emptyBody}
          action={
            <Link
              href="/licensee/sub-accounts/new"
              className={`mt-6 ${LICENSEE_PRIMARY_CTA_CLASS}`}
            >
              {messages.dashboard.createCompanyAccount}
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={messages.dashboard.noMatchTitle}
          body={messages.dashboard.noMatchBody}
        />
      ) : (
        <>
          {!hasOwnCompany ? (
            <div className={LICENSEE_WARNING_NOTICE_CLASS}>
              <h2 className="text-base font-semibold text-white">
                {messages.dashboard.ownCompanyQuestion}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                {messages.dashboard.ownCompanyQuestionBody}
              </p>
            </div>
          ) : null}

          {hasOwnCompany ? (
            <Section title={messages.dashboard.myCompany}>
              {ownCompany.length === 0 ? (
                <p className="text-sm text-white/40">
                  {messages.dashboard.companyHiddenBySearch}
                </p>
              ) : (
                <ul className="space-y-5">
                  {ownCompany.map((item) => (
                    <SubAccountCard
                      key={item.relationshipId}
                      item={item}
                      opening={openingId === item.organizationId}
                      pinDisabled={pinPending}
                      designateDisabled={designatePending}
                      canDesignateOwnCompany={false}
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
                      onRequestRemove={() => undefined}
                      onRequestRestore={() => undefined}
                      restorePending={false}
                      onDesignateOwnCompany={() =>
                        designateOwnCompany(item.relationshipId)
                      }
                      messages={messages}
                      locale={locale}
                    />
                  ))}
                </ul>
              )}
            </Section>
          ) : null}

          <Section title={messages.dashboard.pinned}>
            {pinned.length === 0 ? (
              <p className="text-sm text-white/40">{messages.dashboard.noPinned}</p>
            ) : (
              <ul className="space-y-5">
                {pinned.map((item) => (
                  <SubAccountCard
                    key={item.relationshipId}
                    item={item}
                    opening={openingId === item.organizationId}
                    pinDisabled={pinPending}
                    designateDisabled={designatePending}
                    canDesignateOwnCompany={!hasOwnCompany}
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
                    onRequestRemove={() => {
                      if (licenseeSubAccountRemovalKind(item) !== "remove") {
                        return;
                      }
                      setConfirmRemove(item);
                    }}
                    onRequestRestore={() => {
                      if (licenseeSubAccountRemovalKind(item) !== "restore") {
                        return;
                      }
                      setConfirmRestore(item);
                    }}
                    restorePending={restorePending}
                    onDesignateOwnCompany={() =>
                      designateOwnCompany(item.relationshipId)
                    }
                    messages={messages}
                    locale={locale}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title={messages.dashboard.allSubAccounts}>
            {unpinned.length === 0 ? (
              <p className="text-sm text-white/40">
                {hasOwnCompany
                  ? messages.dashboard.clientSubAccountsWillAppear
                  : messages.dashboard.allLinkedArePinned}
              </p>
            ) : (
              <ul className="space-y-5">
                {unpinned.map((item) => (
                  <SubAccountCard
                    key={item.relationshipId}
                    item={item}
                    opening={openingId === item.organizationId}
                    pinDisabled={pinPending}
                    designateDisabled={designatePending}
                    canDesignateOwnCompany={!hasOwnCompany}
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
                    onRequestRemove={() => {
                      if (licenseeSubAccountRemovalKind(item) !== "remove") {
                        return;
                      }
                      setConfirmRemove(item);
                    }}
                    onRequestRestore={() => {
                      if (licenseeSubAccountRemovalKind(item) !== "restore") {
                        return;
                      }
                      setConfirmRestore(item);
                    }}
                    restorePending={restorePending}
                    onDesignateOwnCompany={() =>
                      designateOwnCompany(item.relationshipId)
                    }
                    messages={messages}
                    locale={locale}
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
          messages={messages}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={confirmRemoveSubAccount}
        />
      ) : null}

      {confirmRestore ? (
        <RestoreToProspectConfirmDialog
          businessName={resolveLicenseeSubAccountTitle(confirmRestore)}
          pending={restorePending}
          messages={messages}
          onCancel={() => {
            if (restorePending) {
              return;
            }
            setConfirmRestore(null);
          }}
          onConfirm={confirmRestoreToProspect}
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
      <h2 className={LICENSEE_SECTION_HEADER_CLASS}>
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
    <div className={LICENSEE_EMPTY_STATE_CLASS}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
        {body}
      </p>
      {action}
    </div>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="5.5"
        y="11"
        width="13"
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 11V8.5a4 4 0 0 1 8 0V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RestoreToProspectConfirmDialog({
  businessName,
  pending,
  messages,
  onCancel,
  onConfirm,
}: {
  businessName: string;
  pending: boolean;
  messages: LicenseeMessages;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-to-prospect-title"
        className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
      >
        <h2
          id="restore-to-prospect-title"
          className="text-xl font-semibold text-white"
        >
          {interpolateTenantMessage(messages.subAccountCard.restoreTitle, {
            name: businessName,
          })}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/55">
          {messages.subAccountCard.restoreBody}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            {messages.common.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
          >
            {pending
              ? messages.common.moving
              : messages.subAccountCard.moveBackToProspect}
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveConfirmDialog({
  businessName,
  pending,
  messages,
  onCancel,
  onConfirm,
}: {
  businessName: string;
  pending: boolean;
  messages: LicenseeMessages;
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
          {interpolateTenantMessage(messages.subAccountCard.removeTitle, {
            name: businessName,
          })}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/55">
          {messages.subAccountCard.removeBody}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {messages.subAccountCard.removeKeepData}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            {messages.common.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:opacity-60"
          >
            {pending
              ? messages.common.removing
              : messages.subAccountCard.removeConfirm}
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
  designateDisabled,
  canDesignateOwnCompany,
  onTogglePin,
  onOpen,
  onSaveNotes,
  onSaveDisplayName,
  onRequestRemove,
  onRequestRestore,
  restorePending,
  onDesignateOwnCompany,
  messages,
  locale,
}: {
  item: LicenseeDashboardSubAccountItem;
  opening: boolean;
  pinDisabled: boolean;
  designateDisabled: boolean;
  canDesignateOwnCompany: boolean;
  onTogglePin: () => void;
  onOpen: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onSaveDisplayName: (displayName: string) => Promise<void>;
  onRequestRemove: () => void;
  onRequestRestore: () => void;
  restorePending: boolean;
  onDesignateOwnCompany: () => void;
  messages: LicenseeMessages;
  locale: string;
}) {
  const removalKind = licenseeSubAccountRemovalKind(item);
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
      className={`${
        item.isOwnCompany
          ? LICENSEE_OWN_COMPANY_CARD_CLASS
          : LICENSEE_SUB_ACCOUNT_CARD_CLASS
      } ${
        !item.isOwnCompany && expanded
          ? "border-white/28 ring-1 ring-white/10"
          : ""
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
              {item.isOwnCompany ? (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                  <LockIcon className="h-3 w-3" />
                  {messages.subAccountCard.myCompany}
                </div>
              ) : null}
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
            {opening
              ? messages.subAccountCard.opening
              : messages.subAccountCard.openAthena}
          </button>
        </div>

        <AccountReadinessBar
          percent={readinessPercent}
          label={messages.subAccountCard.accountReadiness}
        />

        <div className="flex flex-wrap gap-2">
          <StatusChip label={messages.subAccountCard.brain} ready={item.metrics.brainReady} />
          <StatusChip label={messages.subAccountCard.seo} ready={item.metrics.seoReady} />
          <StatusChip label={messages.subAccountCard.ads} ready={item.metrics.adsReady} />
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <MetricStat
            label={messages.subAccountCard.prospects}
            value={item.metrics.prospectCount}
          />
          <MetricStat
            label={messages.subAccountCard.discussions}
            value={item.metrics.discussionCount}
          />
          <MetricStat
            label={messages.subAccountCard.personas}
            value={item.metrics.personaCount}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-white/12 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
              {messages.subAccountCard.lastVisit}
            </div>
            <div className="mt-1.5 text-sm text-white/70">
              {formatLastVisit(item.metrics.lastVisitedAt, locale, messages)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/15 px-3.5 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
            {expanded ? messages.common.hideDetails : messages.common.details}
          </button>
        </div>

        {expanded ? (
          <div className="space-y-5 border-t border-white/12 pt-5">
            {item.accountSnapshot ? (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
                  {messages.subAccountCard.accountSnapshot}
                </div>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  {item.accountSnapshot}
                </p>
              </div>
            ) : null}

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
                {messages.subAccountCard.accountReadiness}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/45">
                {messages.subAccountCard.readinessExplainer}
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
                    {readinessDimensionLabel(dimension.key, messages)}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">
                  {messages.subAccountCard.masterDisplayName}
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
                    {messages.common.edit}
                  </button>
                ) : null}
              </div>
              {!editingName ? (
                <p className="mt-2 text-sm text-white/65">
                  {item.displayName?.trim() ||
                    messages.subAccountCard.usingAthenaAccountName}
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
                        {messages.common.cancel}
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
                                  : messages.errors.displayNameSaveFailed,
                              );
                            })
                            .finally(() => setSavingDisplayName(false));
                        }}
                        className="rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                      >
                        {savingDisplayName
                          ? messages.common.saving
                          : messages.common.save}
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
                {messages.subAccountCard.masterNote}
                <textarea
                  value={draftNotes}
                  onChange={(event) => {
                    setDraftNotes(event.target.value);
                    setNotesError(null);
                  }}
                  rows={3}
                  maxLength={LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH}
                  placeholder={messages.subAccountCard.notePlaceholder}
                  className="mt-2 w-full resize-y rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)]/70"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-white/30">
                  {draftNotes.length}/{LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH}
                  {notesDirty ? messages.common.unsaved : ""}
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
                            : messages.errors.noteSaveFailed,
                        );
                      })
                      .finally(() => setSavingNotes(false));
                  }}
                  className="rounded-xl border border-white/15 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  {savingNotes
                    ? messages.common.saving
                    : messages.subAccountCard.saveNote}
                </button>
              </div>
              {notesError ? (
                <p className="mt-2 text-xs text-red-300">{notesError}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
              {canDesignateOwnCompany && !item.isOwnCompany ? (
                <button
                  type="button"
                  disabled={designateDisabled}
                  onClick={onDesignateOwnCompany}
                  className="inline-flex items-center rounded-xl border border-[var(--athena-orange)]/35 bg-[var(--athena-orange)]/10 px-3 py-2 text-sm font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20 disabled:opacity-50"
                >
                  {messages.subAccountCard.setAsMyCompany}
                </button>
              ) : null}
              {item.isOwnCompany ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/45">
                  <LockIcon className="h-3.5 w-3.5" />
                  {messages.subAccountCard.lockedCompanyIdentity}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pinDisabled}
                    onClick={onTogglePin}
                    aria-label={
                      item.pinned
                        ? messages.subAccountCard.unpinAria
                        : messages.subAccountCard.pinAria
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <span className="text-[var(--athena-orange)]">
                      {item.pinned ? "★" : "☆"}
                    </span>
                    {item.pinned ? messages.common.pinned : messages.common.pin}
                  </button>
                  {removalKind === "restore" ? (
                    <button
                      type="button"
                      disabled={restorePending}
                      aria-busy={restorePending}
                      onClick={onRequestRestore}
                      className={RESTORE_TO_PROSPECT_LIFECYCLE_ACTION}
                    >
                      {restorePending
                        ? messages.common.moving
                        : messages.subAccountCard.moveBackToProspect}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestRemove}
                      className="inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-sm text-white/55 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
                    >
                      {messages.common.remove}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function AccountReadinessBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/40">
          {label}
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

function readinessDimensionLabel(
  key: "brain" | "website" | "seo" | "ads" | "personas" | "prospects",
  messages: LicenseeMessages,
): string {
  switch (key) {
    case "brain":
      return messages.subAccountCard.readinessBrain;
    case "website":
      return messages.subAccountCard.readinessWebsite;
    case "seo":
      return messages.subAccountCard.readinessSeo;
    case "ads":
      return messages.subAccountCard.readinessAds;
    case "personas":
      return messages.subAccountCard.readinessPersonas;
    case "prospects":
      return messages.subAccountCard.readinessProspects;
  }
}

function formatLastVisit(
  iso: string | null,
  locale: string,
  messages: LicenseeMessages,
): string {
  return formatLicenseeLastVisit(iso, locale, {
    neverVisited: messages.common.neverVisited,
    today: messages.common.today,
    yesterday: messages.common.yesterday,
    separator: messages.common.lastVisitSeparator,
  });
}
