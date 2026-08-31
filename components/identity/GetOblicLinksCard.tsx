"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { writeClipboardText } from "@/lib/clipboard";
import {
  filterGetOblicLinkHistory,
  markGetOblicLinkHistoryMissing,
  readGetOblicLinksHistory,
  removeGetOblicLinkHistoryEntry,
  upsertGetOblicLinkHistoryEntry,
} from "@/lib/getoblic-links/history";
import { downloadDataUrlPng, renderGetOblicQrDataUrl } from "@/lib/getoblic-links/qr";
import {
  buildTemplateDestinationUrl,
  GETOBLIC_LINK_TEMPLATES,
  getGetOblicLinkTemplate,
} from "@/lib/getoblic-links/templates";
import type {
  GetOblicLinkHistoryEntry,
  GetOblicLinkRecord,
  GetOblicLinkTemplateId,
} from "@/lib/getoblic-links/types";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type GetOblicLinksMessages = TenantMessages["identity"]["getoblic"];

const DEFAULT_GETOBLIC_MESSAGES: GetOblicLinksMessages = {
  title: "GetOblic Links",
  status: "Status",
  checking: "Checking…",
  healthy: "Healthy",
  unhealthy: "Unhealthy",
  notConfigured: "Not configured",
  unavailable: "Unavailable",
  createLink: "Create Link",
  manageLinks: "Manage Links",
  latestLink: "Latest Link",
  emptyLatest: "No links yet. Create your first GetOblic short link.",
  removed: "Removed",
  copied: "Copied",
  copy: "Copy",
  copyShortLink: "Copy short link",
  copiedToClipboard: "Copied to clipboard",
  open: "Open",
  qr: "QR",
  createTitle: "Create GetOblic Link",
  manageTitle: "Manage GetOblic Links",
  detailsTitle: "Link Details",
  closeDialog: "Close dialog",
  close: "Close",
  template: "Template",
  destinationUrl: "Destination URL",
  customSlug: "Custom slug (optional)",
  labelOptional: "Label (optional)",
  labelPlaceholder: "Internal note",
  destinationPreview: "Destination preview",
  completeFields: "Complete the fields to preview the destination.",
  createShortLink: "Create short link",
  creating: "Creating…",
  shortLinkCreated: "Short link created.",
  unexpectedResponse: "GetOblic Links returned an unexpected response.",
  unableToCopy: "Unable to copy link.",
  unableToBuildDestination: "Unable to build destination.",
  fixDestination: "Fix the destination before creating a link.",
  failedToCreate: "Failed to create link.",
  manageHelp:
    "Recent links are stored locally for this organization and user. The Worker has no list endpoint.",
  search: "Search",
  searchPlaceholder: "Slug, URL, label…",
  searchAria: "Search links",
  allTemplates: "All templates",
  allStatuses: "All statuses",
  enabled: "Enabled",
  disabled: "Disabled",
  shownCount: "{shown} of {total} shown",
  refreshMetadata: "Refresh metadata",
  refreshing: "Refreshing…",
  emptyHistory: "No recent links yet. Create a short link to get started.",
  noMatches: "No links match your search or filters.",
  details: "Details",
  clicksApprox: "~{count} clicks",
  backToManage: "← Back to manage",
  loadingLink: "Loading link…",
  shortUrl: "Short URL",
  slugLabel: "Slug:",
  statusLabel: "Status:",
  approximateClicks: "Approximate clicks:",
  templateLabel: "Template:",
  destination: "Destination",
  saveDestination: "Save destination",
  disable: "Disable",
  enable: "Enable",
  delete: "Delete",
  qrCode: "QR Code",
  downloadPng: "Download PNG",
  generatingQr: "Generating QR…",
  qrUnavailable: "QR preview unavailable.",
  unableToGenerateQr: "Unable to generate QR code.",
  linkNoLongerExists: "This link no longer exists on the Worker.",
  unableToLoadDetails: "Unable to load link details.",
  updateFailed: "Update failed.",
  deleteFailed: "Delete failed.",
  linkUpdated: "Link updated.",
  linkDeleted: "Link deleted.",
  deleteConfirm: "Delete short link “{slug}”? This cannot be undone.",
  templateBusinessCreated: "Business Created",
  templateBusinessCreatedHelp:
    "Claim page for a newly created business listing.",
  templateAiCalendar: "AI Calendar",
  templateAiCalendarHelp: "Voice AI calendar booking page.",
  templateCustom: "Custom",
  templateCustomHelp: "Any valid HTTP or HTTPS destination URL.",
  fieldContactId: "Contact ID",
  fieldContactIdPlaceholder: "contact_…",
  fieldBusinessName: "Business Name",
  fieldBusinessNamePlaceholder: "Acme Salon",
};

const fieldClassName =
  "w-full rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

const secondaryButtonClassName =
  "inline-flex items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-black/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-40";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

const ghostButtonClassName =
  "inline-flex items-center justify-center rounded-xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-2 text-xs font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20 disabled:cursor-not-allowed disabled:opacity-40";

type DialogMode = "create" | "manage" | "details";

type ApiErrorPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string };
};

type HealthPayload = ApiErrorPayload & {
  healthy?: boolean;
  status?: string;
};

type LinkPayload = ApiErrorPayload & {
  link?: GetOblicLinkRecord;
};

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

function localizedTemplateLabel(
  id: GetOblicLinkTemplateId,
  messages: GetOblicLinksMessages,
): string {
  switch (id) {
    case "business_created":
      return messages.templateBusinessCreated;
    case "ai_calendar":
      return messages.templateAiCalendar;
    case "custom":
      return messages.templateCustom;
  }
}

function localizedTemplateHelp(
  id: GetOblicLinkTemplateId,
  messages: GetOblicLinksMessages,
): string {
  switch (id) {
    case "business_created":
      return messages.templateBusinessCreatedHelp;
    case "ai_calendar":
      return messages.templateAiCalendarHelp;
    case "custom":
      return messages.templateCustomHelp;
  }
}

function localizedFieldChrome(
  key: string,
  messages: GetOblicLinksMessages,
): { label: string; placeholder: string } {
  if (key === "contact_id") {
    return {
      label: messages.fieldContactId,
      placeholder: messages.fieldContactIdPlaceholder,
    };
  }
  if (key === "business_name") {
    return {
      label: messages.fieldBusinessName,
      placeholder: messages.fieldBusinessNamePlaceholder,
    };
  }
  return { label: key, placeholder: "" };
}

async function apiJson<T>(
  input: RequestInfo,
  init?: RequestInit,
  unexpectedMessage = "GetOblic Links returned an unexpected response.",
): Promise<{ response: Response; payload: T }> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await parseJsonResponse<T>(response, {
    unexpectedMessage,
  });
  return { response, payload };
}

export function GetOblicLinksCard(props: {
  organizationId: string;
  userId: string;
  messages?: GetOblicLinksMessages;
}) {
  const messages = props.messages ?? DEFAULT_GETOBLIC_MESSAGES;
  const titleId = useId();
  const [healthStatus, setHealthStatus] = useState<
    "loading" | "healthy" | "unhealthy" | "unconfigured" | "error"
  >("loading");
  const [healthDetail, setHealthDetail] = useState<string | null>(null);
  // Empty on SSR/first paint to avoid hydration mismatch; rehydrate after mount.
  const [history, setHistory] = useState<GetOblicLinkHistoryEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const latest = history.find((entry) => !entry.missing) ?? history[0] ?? null;

  const reloadHistory = useCallback(() => {
    setHistory(readGetOblicLinksHistory(props.organizationId, props.userId));
  }, [props.organizationId, props.userId]);

  // Client-only history rehydrate; scoped to org/user. No Worker calls.
  // Defer setState so SSR/client first paint stay empty (no hydration mismatch)
  // and eslint react-hooks/set-state-in-effect stays clean.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setHistory(
        readGetOblicLinksHistory(props.organizationId, props.userId),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [props.organizationId, props.userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { response, payload } = await apiJson<HealthPayload>(
          "/api/getoblic-links/health",
          undefined,
          messages.unexpectedResponse,
        );
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          if (payload.error?.code === "CONFIG_MISSING") {
            setHealthStatus("unconfigured");
            setHealthDetail(null);
            return;
          }
          setHealthStatus("error");
          setHealthDetail(payload.error?.message || null);
          return;
        }
        if (payload.healthy) {
          setHealthStatus("healthy");
          setHealthDetail(null);
        } else {
          setHealthStatus("unhealthy");
          setHealthDetail(payload.status || null);
        }
      } catch {
        if (!cancelled) {
          setHealthStatus("error");
          setHealthDetail(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages.unexpectedResponse]);

  const openDialog = (mode: DialogMode, slug?: string | null) => {
    setBanner(null);
    setDialogMode(mode);
    setSelectedSlug(slug ?? null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedSlug(null);
    reloadHistory();
  };

  const copyLink = async (value: string, key: string) => {
    try {
      await writeClipboardText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1600);
    } catch {
      setBanner({ tone: "error", message: messages.unableToCopy });
    }
  };

  const healthLabel =
    healthStatus === "loading"
      ? messages.checking
      : healthStatus === "healthy"
        ? messages.healthy
        : healthStatus === "unconfigured"
          ? messages.notConfigured
          : healthStatus === "unhealthy"
            ? healthDetail || messages.unhealthy
            : healthDetail || messages.unavailable;

  const statusColor =
    healthStatus === "healthy"
      ? "text-[var(--athena-success)]"
      : healthStatus === "loading"
        ? "text-white/55"
        : "text-[var(--athena-warning)]";

  return (
    <div className="mt-8 space-y-3">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="text-xs uppercase tracking-[0.25em] text-white/35">
          {messages.title}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              {messages.status}
            </div>
            <div className={`mt-1 text-lg font-semibold ${statusColor}`}>
              {healthStatus === "loading" ? (
                <span className="inline-flex items-center">
                  <ButtonSpinner />
                  {messages.checking}
                </span>
              ) : (
                healthLabel
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => openDialog("create")}
          >
            {messages.createLink}
          </button>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => openDialog("manage")}
          >
            {messages.manageLinks}
          </button>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            {messages.latestLink}
          </div>
          {latest ? (
            <div className="mt-2 space-y-3">
              <div className="break-all text-sm text-white/80">
                {latest.short_url}
              </div>
              <div className="text-xs text-white/40">
                {localizedTemplateLabel(latest.template, messages)}
                {latest.missing ? ` · ${messages.removed}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ghostButtonClassName}
                  onClick={() => void copyLink(latest.short_url, "latest")}
                  aria-label={
                    copiedKey === "latest"
                      ? messages.copiedToClipboard
                      : messages.copyShortLink
                  }
                >
                  {copiedKey === "latest" ? messages.copied : messages.copy}
                </button>
                <a
                  href={latest.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ghostButtonClassName}
                >
                  {messages.open}
                </a>
                <button
                  type="button"
                  className={ghostButtonClassName}
                  onClick={() => openDialog("details", latest.slug)}
                >
                  {messages.qr}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/45">
              {messages.emptyLatest}
            </p>
          )}
        </div>

        {banner && !dialogOpen ? (
          <div
            className={`mt-4 rounded-2xl border p-3 text-sm ${
              banner.tone === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : "border-rose-400/20 bg-rose-400/10 text-rose-200"
            }`}
            role="status"
          >
            {banner.message}
          </div>
        ) : null}
      </div>

      {dialogOpen ? (
        <GetOblicLinksDialog
          titleId={titleId}
          mode={dialogMode}
          organizationId={props.organizationId}
          userId={props.userId}
          history={history}
          selectedSlug={selectedSlug}
          onClose={closeDialog}
          onHistoryChange={setHistory}
          onModeChange={setDialogMode}
          onSelectSlug={setSelectedSlug}
          onBanner={setBanner}
          copiedKey={copiedKey}
          onCopy={copyLink}
          messages={messages}
        />
      ) : null}
    </div>
  );
}

function GetOblicLinksDialog(props: {
  titleId: string;
  mode: DialogMode;
  organizationId: string;
  userId: string;
  history: GetOblicLinkHistoryEntry[];
  selectedSlug: string | null;
  onClose: () => void;
  onHistoryChange: (entries: GetOblicLinkHistoryEntry[]) => void;
  onModeChange: (mode: DialogMode) => void;
  onSelectSlug: (slug: string | null) => void;
  onBanner: (banner: { tone: "success" | "error"; message: string } | null) => void;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => Promise<void>;
  messages: GetOblicLinksMessages;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const onClose = props.onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previous?.focus?.();
    };
  }, [onClose]);

  const title =
    props.mode === "create"
      ? props.messages.createTitle
      : props.mode === "manage"
        ? props.messages.manageTitle
        : props.messages.detailsTitle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] shadow-2xl shadow-black/50 sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {props.messages.title}
            </div>
            <h3
              id={props.titleId}
              className="mt-2 text-xl font-semibold text-white"
            >
              {title}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={props.onClose}
            className={ghostButtonClassName}
            aria-label={props.messages.closeDialog}
          >
            {props.messages.close}
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {props.mode === "create" ? (
            <CreateLinkForm
              organizationId={props.organizationId}
              userId={props.userId}
              onHistoryChange={props.onHistoryChange}
              onBanner={props.onBanner}
              onCreated={(slug) => {
                props.onSelectSlug(slug);
                props.onModeChange("details");
              }}
              messages={props.messages}
            />
          ) : null}

          {props.mode === "manage" ? (
            <ManageLinksPanel
              organizationId={props.organizationId}
              userId={props.userId}
              history={props.history}
              onHistoryChange={props.onHistoryChange}
              onBanner={props.onBanner}
              onCreate={() => props.onModeChange("create")}
              onOpenDetails={(slug) => {
                props.onSelectSlug(slug);
                props.onModeChange("details");
              }}
              copiedKey={props.copiedKey}
              onCopy={props.onCopy}
              messages={props.messages}
            />
          ) : null}

          {props.mode === "details" && props.selectedSlug ? (
            <LinkDetailsPanel
              organizationId={props.organizationId}
              userId={props.userId}
              slug={props.selectedSlug}
              history={props.history}
              onHistoryChange={props.onHistoryChange}
              onBanner={props.onBanner}
              onBack={() => props.onModeChange("manage")}
              copiedKey={props.copiedKey}
              onCopy={props.onCopy}
              messages={props.messages}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CreateLinkForm(props: {
  organizationId: string;
  userId: string;
  onHistoryChange: (entries: GetOblicLinkHistoryEntry[]) => void;
  onBanner: (banner: { tone: "success" | "error"; message: string } | null) => void;
  onCreated: (slug: string) => void;
  messages: GetOblicLinksMessages;
}) {
  const [templateId, setTemplateId] =
    useState<GetOblicLinkTemplateId>("business_created");
  const [params, setParams] = useState<Record<string, string>>({
    contact_id: "",
    business_name: "",
  });
  const [customUrl, setCustomUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const template = getGetOblicLinkTemplate(templateId);

  const previewState = useMemo(() => {
    try {
      return {
        preview: buildTemplateDestinationUrl({
          templateId,
          params,
          customUrl,
        }),
        previewError: null as string | null,
      };
    } catch (error) {
      return {
        preview: null as string | null,
        previewError:
          error instanceof Error
            ? error.message
            : props.messages.unableToBuildDestination,
      };
    }
  }, [templateId, params, customUrl, props.messages.unableToBuildDestination]);
  const { preview, previewError } = previewState;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!preview) {
      setFormError(previewError || props.messages.fixDestination);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { url: preview };
      const trimmedSlug = slug.trim();
      if (trimmedSlug) {
        body.slug = trimmedSlug;
      }

      const { response, payload } = await apiJson<LinkPayload>(
        "/api/getoblic-links",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        props.messages.unexpectedResponse,
      );

      if (!response.ok || !payload.ok || !payload.link) {
        setFormError(payload.error?.message || props.messages.failedToCreate);
        return;
      }

      const entry: GetOblicLinkHistoryEntry = {
        slug: payload.link.slug,
        short_url: payload.link.short_url,
        url: payload.link.url,
        template: templateId,
        created_at: payload.link.created_at || new Date().toISOString(),
        label: label.trim() || null,
        disabled: payload.link.disabled,
        click_count: payload.link.click_count,
        missing: false,
      };

      const next = upsertGetOblicLinkHistoryEntry(
        props.organizationId,
        props.userId,
        entry,
      );
      props.onHistoryChange(next);
      setSuccess(props.messages.shortLinkCreated);
      props.onBanner({ tone: "success", message: props.messages.shortLinkCreated });
      props.onCreated(payload.link.slug);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : props.messages.failedToCreate,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => void onSubmit(event)}>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-white/80">
          {props.messages.template}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {GETOBLIC_LINK_TEMPLATES.map((option) => {
            const selected = option.id === templateId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTemplateId(option.id)}
                className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  selected
                    ? "border-[var(--athena-orange)]/60 bg-[var(--athena-orange)]/10 text-white"
                    : "border-white/10 bg-black/20 text-white/70 hover:border-white/20"
                }`}
                aria-pressed={selected}
              >
                <div className="font-semibold">
                  {localizedTemplateLabel(option.id, props.messages)}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {localizedTemplateHelp(option.id, props.messages)}
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {template.id === "custom" ? (
        <label className="grid gap-2">
          <span className="text-sm font-medium text-white/80">
            {props.messages.destinationUrl}
          </span>
          <input
            className={fieldClassName}
            value={customUrl}
            onChange={(event) => setCustomUrl(event.target.value)}
            placeholder="https://claim.getoblic.com/path"
            inputMode="url"
            autoComplete="url"
          />
        </label>
      ) : (
        template.fields.map((field) => {
          const fieldChrome = localizedFieldChrome(field.key, props.messages);
          return (
            <label key={field.key} className="grid gap-2">
              <span className="text-sm font-medium text-white/80">
                {fieldChrome.label}
                {field.required ? " *" : ""}
              </span>
              <input
                className={fieldClassName}
                value={params[field.key] ?? ""}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={fieldChrome.placeholder}
                required={field.required}
              />
            </label>
          );
        })
      )}

      <label className="grid gap-2">
        <span className="text-sm font-medium text-white/80">
          {props.messages.customSlug}
        </span>
        <input
          className={fieldClassName}
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="my-link"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-white/80">
          {props.messages.labelOptional}
        </span>
        <input
          className={fieldClassName}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={props.messages.labelPlaceholder}
        />
      </label>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
          {props.messages.destinationPreview}
        </div>
        {preview ? (
          <p className="mt-2 break-all text-sm text-white/75">{preview}</p>
        ) : (
          <p className="mt-2 text-sm text-white/45">
            {previewError || props.messages.completeFields}
          </p>
        )}
      </div>

      {formError ? (
        <div
          className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200"
          role="alert"
        >
          {formError}
        </div>
      ) : null}
      {success ? (
        <div
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200"
          role="status"
        >
          {success}
        </div>
      ) : null}

      <button
        type="submit"
        className={primaryButtonClassName}
        disabled={submitting || !preview}
      >
        {submitting ? <ButtonSpinner /> : null}
        {submitting ? props.messages.creating : props.messages.createShortLink}
      </button>
    </form>
  );
}

function ManageLinksPanel({
  organizationId,
  userId,
  history,
  onHistoryChange,
  onCreate,
  onOpenDetails,
  copiedKey,
  onCopy,
  messages,
}: {
  organizationId: string;
  userId: string;
  history: GetOblicLinkHistoryEntry[];
  onHistoryChange: (entries: GetOblicLinkHistoryEntry[]) => void;
  onBanner: (banner: { tone: "success" | "error"; message: string } | null) => void;
  onCreate: () => void;
  onOpenDetails: (slug: string) => void;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => Promise<void>;
  messages: GetOblicLinksMessages;
}) {
  const [query, setQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState<
    GetOblicLinkTemplateId | "all"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled" | "missing"
  >("all");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () =>
      filterGetOblicLinkHistory(history, {
        query,
        template: templateFilter,
        status: statusFilter,
      }),
    [history, query, templateFilter, statusFilter],
  );

  const refreshMetadata = useCallback(
    async (entries: GetOblicLinkHistoryEntry[]) => {
      if (entries.length === 0) {
        return;
      }
      setRefreshing(true);
      try {
        for (const entry of entries) {
          try {
            const { response, payload } = await apiJson<LinkPayload>(
              `/api/getoblic-links/${encodeURIComponent(entry.slug)}`,
              undefined,
              messages.unexpectedResponse,
            );
            if (response.status === 404 || payload.error?.code === "NOT_FOUND") {
              markGetOblicLinkHistoryMissing(
                organizationId,
                userId,
                entry.slug,
              );
              continue;
            }
            if (!response.ok || !payload.ok || !payload.link) {
              continue;
            }
            upsertGetOblicLinkHistoryEntry(organizationId, userId, {
              ...entry,
              short_url: payload.link.short_url || entry.short_url,
              url: payload.link.url || entry.url,
              disabled: payload.link.disabled,
              click_count: payload.link.click_count,
              missing: false,
              label: entry.label ?? null,
            });
          } catch {
            // Keep local entry on transient failures.
          }
        }
        onHistoryChange(readGetOblicLinksHistory(organizationId, userId));
      } finally {
        setRefreshing(false);
      }
    },
    [organizationId, userId, onHistoryChange, messages.unexpectedResponse],
  );

  useEffect(() => {
    const initialEntries = history;
    const timer = window.setTimeout(() => {
      void refreshMetadata(initialEntries);
    }, 0);
    return () => window.clearTimeout(timer);
    // Refresh once when Manage opens with the entries present at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">
          {messages.manageHelp}
        </p>
        <button
          type="button"
          className={primaryButtonClassName}
          onClick={onCreate}
        >
          {messages.createLink}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-2 sm:col-span-1">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            {messages.search}
          </span>
          <input
            className={fieldClassName}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={messages.searchPlaceholder}
            aria-label={messages.searchAria}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            {messages.template}
          </span>
          <select
            className={fieldClassName}
            value={templateFilter}
            onChange={(event) =>
              setTemplateFilter(
                event.target.value as GetOblicLinkTemplateId | "all",
              )
            }
          >
            <option value="all">{messages.allTemplates}</option>
            {GETOBLIC_LINK_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {localizedTemplateLabel(template.id, messages)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            {messages.status}
          </span>
          <select
            className={fieldClassName}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "enabled" | "disabled" | "missing",
              )
            }
          >
            <option value="all">{messages.allStatuses}</option>
            <option value="enabled">{messages.enabled}</option>
            <option value="disabled">{messages.disabled}</option>
            <option value="missing">{messages.removed}</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-white/45">
        <span>
          {interpolateTenantMessage(messages.shownCount, {
            shown: filtered.length,
            total: history.length,
          })}
        </span>
        <button
          type="button"
          className={ghostButtonClassName}
          onClick={() => void refreshMetadata(history)}
          disabled={refreshing || history.length === 0}
        >
          {refreshing ? <ButtonSpinner /> : null}
          {refreshing ? messages.refreshing : messages.refreshMetadata}
        </button>
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-white/50">
          {messages.emptyHistory}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
          {messages.noMatches}
        </div>
      ) : (
        <ul className="grid gap-3">
          {filtered.map((entry) => (
            <li
              key={entry.slug}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="break-all text-sm font-medium text-white/85">
                    {entry.short_url}
                  </div>
                  <div className="mt-1 text-xs text-white/40">
                    {localizedTemplateLabel(entry.template, messages)}
                    {entry.label ? ` · ${entry.label}` : ""}
                    {entry.missing
                      ? ` · ${messages.removed}`
                      : entry.disabled === true
                        ? ` · ${messages.disabled}`
                        : ` · ${messages.enabled}`}
                    {typeof entry.click_count === "number"
                      ? ` · ${interpolateTenantMessage(messages.clicksApprox, {
                          count: entry.click_count,
                        })}`
                      : ""}
                  </div>
                  <div className="mt-2 break-all text-xs text-white/35">
                    {entry.url}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostButtonClassName}
                    onClick={() => void onCopy(entry.short_url, entry.slug)}
                  >
                    {copiedKey === entry.slug ? messages.copied : messages.copy}
                  </button>
                  <a
                    href={entry.short_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ghostButtonClassName}
                  >
                    {messages.open}
                  </a>
                  <button
                    type="button"
                    className={ghostButtonClassName}
                    onClick={() => onOpenDetails(entry.slug)}
                  >
                    {messages.details}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkDetailsPanel(props: {
  organizationId: string;
  userId: string;
  slug: string;
  history: GetOblicLinkHistoryEntry[];
  onHistoryChange: (entries: GetOblicLinkHistoryEntry[]) => void;
  onBanner: (banner: { tone: "success" | "error"; message: string } | null) => void;
  onBack: () => void;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => Promise<void>;
  messages: GetOblicLinksMessages;
}) {
  const historyEntry =
    props.history.find((entry) => entry.slug === props.slug) ?? null;
  const [link, setLink] = useState<GetOblicLinkRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState(
    historyEntry?.url ?? "",
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { response, payload } = await apiJson<LinkPayload>(
          `/api/getoblic-links/${encodeURIComponent(props.slug)}`,
          undefined,
          props.messages.unexpectedResponse,
        );
        if (cancelled) return;

        if (response.status === 404 || payload.error?.code === "NOT_FOUND") {
          const next = markGetOblicLinkHistoryMissing(
            props.organizationId,
            props.userId,
            props.slug,
          );
          props.onHistoryChange(next);
          setLink(null);
          setError(props.messages.linkNoLongerExists);
          return;
        }
        if (!response.ok || !payload.ok || !payload.link) {
          setError(payload.error?.message || props.messages.unableToLoadDetails);
          return;
        }
        setLink(payload.link);
        setDestination(payload.link.url);

        const currentHistory = readGetOblicLinksHistory(
          props.organizationId,
          props.userId,
        );
        const existing =
          currentHistory.find((entry) => entry.slug === props.slug) ?? null;
        if (existing) {
          props.onHistoryChange(
            upsertGetOblicLinkHistoryEntry(
              props.organizationId,
              props.userId,
              {
                ...existing,
                short_url: payload.link.short_url,
                url: payload.link.url,
                disabled: payload.link.disabled,
                click_count: payload.link.click_count,
                missing: false,
              },
            ),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : props.messages.unableToLoadDetails,
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Load once per slug open; history updates are written inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug, props.organizationId, props.userId]);

  const shortUrlForQr = link?.short_url || historyEntry?.short_url || "";

  useEffect(() => {
    if (!shortUrlForQr) {
      return;
    }
    let cancelled = false;
    void renderGetOblicQrDataUrl(shortUrlForQr)
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrError(props.messages.unableToGenerateQr);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shortUrlForQr, props.messages.unableToGenerateQr]);

  const qrPreviewUrl = shortUrlForQr ? qrDataUrl : null;

  async function patchLink(body: Record<string, unknown>, action: string) {
    setBusyAction(action);
    setError(null);
    try {
      const { response, payload } = await apiJson<LinkPayload>(
        `/api/getoblic-links/${encodeURIComponent(props.slug)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
        props.messages.unexpectedResponse,
      );
      if (!response.ok || !payload.ok || !payload.link) {
        setError(payload.error?.message || props.messages.updateFailed);
        return;
      }
      setLink(payload.link);
      setDestination(payload.link.url);
      if (historyEntry) {
        props.onHistoryChange(
          upsertGetOblicLinkHistoryEntry(props.organizationId, props.userId, {
            ...historyEntry,
            short_url: payload.link.short_url,
            url: payload.link.url,
            disabled: payload.link.disabled,
            click_count: payload.link.click_count,
            missing: false,
          }),
        );
      }
      props.onBanner({ tone: "success", message: props.messages.linkUpdated });
    } catch (patchError) {
      setError(
        patchError instanceof Error
          ? patchError.message
          : props.messages.updateFailed,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function onDelete() {
    const confirmed = window.confirm(
      interpolateTenantMessage(props.messages.deleteConfirm, {
        slug: props.slug,
      }),
    );
    if (!confirmed) return;
    setBusyAction("delete");
    setError(null);
    try {
      const { response, payload } = await apiJson<ApiErrorPayload>(
        `/api/getoblic-links/${encodeURIComponent(props.slug)}`,
        { method: "DELETE" },
        props.messages.unexpectedResponse,
      );
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message || props.messages.deleteFailed);
        return;
      }
      props.onHistoryChange(
        removeGetOblicLinkHistoryEntry(
          props.organizationId,
          props.userId,
          props.slug,
        ),
      );
      props.onBanner({ tone: "success", message: props.messages.linkDeleted });
      props.onBack();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : props.messages.deleteFailed,
      );
    } finally {
      setBusyAction(null);
    }
  }

  const shortUrl = shortUrlForQr;
  const disabled = link?.disabled ?? historyEntry?.disabled ?? false;
  const enabled = !disabled;

  function onDestinationKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void patchLink({ url: destination }, "save");
    }
  }

  return (
    <div className="grid gap-5">
      <button type="button" className={ghostButtonClassName} onClick={props.onBack}>
        {props.messages.backToManage}
      </button>

      {loading ? (
        <div className="inline-flex items-center text-sm text-white/55">
          <ButtonSpinner />
          {props.messages.loadingLink}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
          {props.messages.shortUrl}
        </div>
        <div className="mt-2 break-all text-sm text-white/85">
          {shortUrl || "—"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={ghostButtonClassName}
            disabled={!shortUrl}
            onClick={() => void props.onCopy(shortUrl, `details:${props.slug}`)}
          >
            {props.copiedKey === `details:${props.slug}`
              ? props.messages.copied
              : props.messages.copy}
          </button>
          {shortUrl ? (
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={ghostButtonClassName}
            >
              {props.messages.open}
            </a>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 text-sm text-white/50">
          <div>
            {props.messages.slugLabel}{" "}
            <span className="text-white/80">{props.slug}</span>
          </div>
          <div>
            {props.messages.statusLabel}{" "}
            <span className="text-white/80">
              {historyEntry?.missing
                ? props.messages.removed
                : enabled
                  ? props.messages.enabled
                  : props.messages.disabled}
            </span>
          </div>
          <div>
            {props.messages.approximateClicks}{" "}
            <span className="text-white/80">
              {typeof link?.click_count === "number"
                ? `~${link.click_count}`
                : "—"}
            </span>
          </div>
          {historyEntry ? (
            <div>
              {props.messages.templateLabel}{" "}
              <span className="text-white/80">
                {localizedTemplateLabel(historyEntry.template, props.messages)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-white/80">
          {props.messages.destination}
        </span>
        <input
          className={fieldClassName}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          onKeyDown={onDestinationKeyDown}
          disabled={Boolean(busyAction) || historyEntry?.missing}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClassName}
          disabled={Boolean(busyAction) || historyEntry?.missing}
          onClick={() => void patchLink({ url: destination }, "save")}
        >
          {busyAction === "save" ? <ButtonSpinner /> : null}
          {props.messages.saveDestination}
        </button>
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={Boolean(busyAction) || historyEntry?.missing}
          onClick={() =>
            void patchLink(
              { disabled: !disabled },
              disabled ? "enable" : "disable",
            )
          }
        >
          {busyAction === "disable" || busyAction === "enable" ? (
            <ButtonSpinner />
          ) : null}
          {enabled ? props.messages.disable : props.messages.enable}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={Boolean(busyAction)}
          onClick={() => void onDelete()}
        >
          {busyAction === "delete" ? <ButtonSpinner /> : null}
          {props.messages.delete}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
          {props.messages.qrCode}
        </div>
        {qrPreviewUrl ? (
          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrPreviewUrl}
              alt={`QR code for ${shortUrl}`}
              width={180}
              height={180}
              className="rounded-xl bg-white p-2"
            />
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() =>
                downloadDataUrlPng(qrPreviewUrl, `getoblic-${props.slug}.png`)
              }
            >
              {props.messages.downloadPng}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/45">
            {qrError ||
              (shortUrlForQr
                ? props.messages.generatingQr
                : props.messages.qrUnavailable)}
          </p>
        )}
      </div>
    </div>
  );
}
