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

function templateLabel(id: GetOblicLinkTemplateId): string {
  return getGetOblicLinkTemplate(id).label;
}

async function apiJson<T>(
  input: RequestInfo,
  init?: RequestInit,
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
    unexpectedMessage: "GetOblic Links returned an unexpected response.",
  });
  return { response, payload };
}

export function GetOblicLinksCard(props: {
  organizationId: string;
  userId: string;
}) {
  const titleId = useId();
  const [healthStatus, setHealthStatus] = useState<
    "loading" | "healthy" | "unhealthy" | "unconfigured" | "error"
  >("loading");
  const [healthLabel, setHealthLabel] = useState("Checking…");
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
        );
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          if (payload.error?.code === "CONFIG_MISSING") {
            setHealthStatus("unconfigured");
            setHealthLabel("Not configured");
            return;
          }
          setHealthStatus("error");
          setHealthLabel(payload.error?.message || "Unavailable");
          return;
        }
        if (payload.healthy) {
          setHealthStatus("healthy");
          setHealthLabel("Healthy");
        } else {
          setHealthStatus("unhealthy");
          setHealthLabel(payload.status || "Unhealthy");
        }
      } catch {
        if (!cancelled) {
          setHealthStatus("error");
          setHealthLabel("Unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setBanner({ tone: "error", message: "Unable to copy link." });
    }
  };

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
          GetOblic Links
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Status
            </div>
            <div className={`mt-1 text-lg font-semibold ${statusColor}`}>
              {healthStatus === "loading" ? (
                <span className="inline-flex items-center">
                  <ButtonSpinner />
                  Checking…
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
            Create Link
          </button>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => openDialog("manage")}
          >
            Manage Links
          </button>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">
            Latest Link
          </div>
          {latest ? (
            <div className="mt-2 space-y-3">
              <div className="break-all text-sm text-white/80">
                {latest.short_url}
              </div>
              <div className="text-xs text-white/40">
                {templateLabel(latest.template)}
                {latest.missing ? " · Removed" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ghostButtonClassName}
                  onClick={() => void copyLink(latest.short_url, "latest")}
                  aria-label={
                    copiedKey === "latest"
                      ? "Copied to clipboard"
                      : "Copy short link"
                  }
                >
                  {copiedKey === "latest" ? "Copied" : "Copy"}
                </button>
                <a
                  href={latest.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ghostButtonClassName}
                >
                  Open
                </a>
                <button
                  type="button"
                  className={ghostButtonClassName}
                  onClick={() => openDialog("details", latest.slug)}
                >
                  QR
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/45">
              No links yet. Create your first GetOblic short link.
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
      ? "Create GetOblic Link"
      : props.mode === "manage"
        ? "Manage GetOblic Links"
        : "Link Details";

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
              GetOblic Links
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
            aria-label="Close dialog"
          >
            Close
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
            : "Unable to build destination.",
      };
    }
  }, [templateId, params, customUrl]);
  const { preview, previewError } = previewState;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!preview) {
      setFormError(previewError || "Fix the destination before creating a link.");
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
      );

      if (!response.ok || !payload.ok || !payload.link) {
        setFormError(payload.error?.message || "Failed to create link.");
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
      setSuccess("Short link created.");
      props.onBanner({ tone: "success", message: "Short link created." });
      props.onCreated(payload.link.slug);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => void onSubmit(event)}>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-white/80">Template</legend>
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
                <div className="font-semibold">{option.label}</div>
                <div className="mt-1 text-xs text-white/45">
                  {option.description}
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {template.id === "custom" ? (
        <label className="grid gap-2">
          <span className="text-sm font-medium text-white/80">
            Destination URL
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
        template.fields.map((field) => (
          <label key={field.key} className="grid gap-2">
            <span className="text-sm font-medium text-white/80">
              {field.label}
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
              placeholder={field.placeholder}
              required={field.required}
            />
          </label>
        ))
      )}

      <label className="grid gap-2">
        <span className="text-sm font-medium text-white/80">
          Custom slug (optional)
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
          Label (optional)
        </span>
        <input
          className={fieldClassName}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Internal note"
        />
      </label>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
          Destination preview
        </div>
        {preview ? (
          <p className="mt-2 break-all text-sm text-white/75">{preview}</p>
        ) : (
          <p className="mt-2 text-sm text-white/45">
            {previewError || "Complete the fields to preview the destination."}
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
        {submitting ? "Creating…" : "Create short link"}
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
    [organizationId, userId, onHistoryChange],
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
          Recent links are stored locally for this organization and user. The
          Worker has no list endpoint.
        </p>
        <button
          type="button"
          className={primaryButtonClassName}
          onClick={onCreate}
        >
          Create Link
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-2 sm:col-span-1">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            Search
          </span>
          <input
            className={fieldClassName}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Slug, URL, label…"
            aria-label="Search links"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            Template
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
            <option value="all">All templates</option>
            {GETOBLIC_LINK_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            Status
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
            <option value="all">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="missing">Removed</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-white/45">
        <span>
          {filtered.length} of {history.length} shown
        </span>
        <button
          type="button"
          className={ghostButtonClassName}
          onClick={() => void refreshMetadata(history)}
          disabled={refreshing || history.length === 0}
        >
          {refreshing ? <ButtonSpinner /> : null}
          {refreshing ? "Refreshing…" : "Refresh metadata"}
        </button>
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-white/50">
          No recent links yet. Create a short link to get started.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
          No links match your search or filters.
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
                    {templateLabel(entry.template)}
                    {entry.label ? ` · ${entry.label}` : ""}
                    {entry.missing
                      ? " · Removed"
                      : entry.disabled === true
                        ? " · Disabled"
                        : " · Enabled"}
                    {typeof entry.click_count === "number"
                      ? ` · ~${entry.click_count} clicks`
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
                    {copiedKey === entry.slug ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={entry.short_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ghostButtonClassName}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    className={ghostButtonClassName}
                    onClick={() => onOpenDetails(entry.slug)}
                  >
                    Details
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
          setError("This link no longer exists on the Worker.");
          return;
        }
        if (!response.ok || !payload.ok || !payload.link) {
          setError(payload.error?.message || "Unable to load link details.");
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
              : "Unable to load link details.",
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
          setQrError("Unable to generate QR code.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shortUrlForQr]);

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
      );
      if (!response.ok || !payload.ok || !payload.link) {
        setError(payload.error?.message || "Update failed.");
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
      props.onBanner({ tone: "success", message: "Link updated." });
    } catch (patchError) {
      setError(
        patchError instanceof Error ? patchError.message : "Update failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete short link “${props.slug}”? This cannot be undone.`,
    );
    if (!confirmed) return;
    setBusyAction("delete");
    setError(null);
    try {
      const { response, payload } = await apiJson<ApiErrorPayload>(
        `/api/getoblic-links/${encodeURIComponent(props.slug)}`,
        { method: "DELETE" },
      );
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message || "Delete failed.");
        return;
      }
      props.onHistoryChange(
        removeGetOblicLinkHistoryEntry(
          props.organizationId,
          props.userId,
          props.slug,
        ),
      );
      props.onBanner({ tone: "success", message: "Link deleted." });
      props.onBack();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Delete failed.",
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
        ← Back to manage
      </button>

      {loading ? (
        <div className="inline-flex items-center text-sm text-white/55">
          <ButtonSpinner />
          Loading link…
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
          Short URL
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
            {props.copiedKey === `details:${props.slug}` ? "Copied" : "Copy"}
          </button>
          {shortUrl ? (
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={ghostButtonClassName}
            >
              Open
            </a>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 text-sm text-white/50">
          <div>
            Slug: <span className="text-white/80">{props.slug}</span>
          </div>
          <div>
            Status:{" "}
            <span className="text-white/80">
              {historyEntry?.missing
                ? "Removed"
                : enabled
                  ? "Enabled"
                  : "Disabled"}
            </span>
          </div>
          <div>
            Approximate clicks:{" "}
            <span className="text-white/80">
              {typeof link?.click_count === "number"
                ? `~${link.click_count}`
                : "—"}
            </span>
          </div>
          {historyEntry ? (
            <div>
              Template:{" "}
              <span className="text-white/80">
                {templateLabel(historyEntry.template)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-white/80">Destination</span>
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
          Save destination
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
          {enabled ? "Disable" : "Enable"}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={Boolean(busyAction)}
          onClick={() => void onDelete()}
        >
          {busyAction === "delete" ? <ButtonSpinner /> : null}
          Delete
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
          QR Code
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
              Download PNG
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/45">
            {qrError ||
              (shortUrlForQr ? "Generating QR…" : "QR preview unavailable.")}
          </p>
        )}
      </div>
    </div>
  );
}
