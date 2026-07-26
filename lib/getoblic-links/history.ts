import type {
  GetOblicLinkHistoryEntry,
  GetOblicLinkTemplateId,
} from "@/lib/getoblic-links/types";

export const GETOBLIC_LINKS_HISTORY_LIMIT = 50;
export const GETOBLIC_LINKS_HISTORY_PREFIX = "athena:getoblic-links:v1";

export function getOblicLinksHistoryStorageKey(
  organizationId: string,
  userId: string,
): string {
  return `${GETOBLIC_LINKS_HISTORY_PREFIX}:${organizationId}:${userId}`;
}

function isTemplateId(value: unknown): value is GetOblicLinkTemplateId {
  return (
    value === "business_created" ||
    value === "ai_calendar" ||
    value === "custom"
  );
}

function normalizeEntry(value: unknown): GetOblicLinkHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.slug !== "string" || !record.slug.trim()) {
    return null;
  }

  const shortUrl =
    typeof record.short_url === "string" && record.short_url.trim()
      ? record.short_url.trim()
      : typeof record.shortUrl === "string" && record.shortUrl.trim()
        ? record.shortUrl.trim()
        : null;
  if (!shortUrl) {
    return null;
  }

  // Prefer canonical `url`; migrate legacy `destination` on read only.
  const url =
    typeof record.url === "string" && record.url.trim()
      ? record.url.trim()
      : typeof record.destination === "string" && record.destination.trim()
        ? record.destination.trim()
        : null;
  if (!url) {
    return null;
  }

  if (!isTemplateId(record.template)) {
    return null;
  }

  const createdAt =
    typeof record.created_at === "string" && record.created_at.trim()
      ? record.created_at.trim()
      : typeof record.createdAt === "string" && record.createdAt.trim()
        ? record.createdAt.trim()
        : null;
  if (!createdAt) {
    return null;
  }

  let disabled: boolean | undefined;
  if (typeof record.disabled === "boolean") {
    disabled = record.disabled;
  } else if (typeof record.enabled === "boolean") {
    disabled = !record.enabled;
  }

  let clickCount: number | null | undefined;
  if (
    typeof record.click_count === "number" &&
    Number.isFinite(record.click_count)
  ) {
    clickCount = record.click_count;
  } else if (record.click_count === null) {
    clickCount = null;
  } else if (
    typeof record.clicks === "number" &&
    Number.isFinite(record.clicks)
  ) {
    clickCount = record.clicks;
  } else if (record.clicks === null) {
    clickCount = null;
  }

  return {
    slug: record.slug.trim(),
    short_url: shortUrl,
    url,
    template: record.template,
    created_at: createdAt,
    label:
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : null,
    missing: record.missing === true,
    disabled,
    click_count: clickCount,
  };
}

export function readGetOblicLinksHistory(
  organizationId: string,
  userId: string,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): GetOblicLinkHistoryEntry[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(
      getOblicLinksHistoryStorageKey(organizationId, userId),
    );
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is GetOblicLinkHistoryEntry => entry != null)
      .slice(0, GETOBLIC_LINKS_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Persist history under the GetOblic Links key only.
 * Stores canonical Worker fields: url, disabled, click_count, short_url.
 * Returns false when storage is unavailable or setItem fails
 * (QuotaExceededError, SecurityError, disabled storage, private browsing).
 * Never throws into callers / UI.
 */
export function writeGetOblicLinksHistory(
  organizationId: string,
  userId: string,
  entries: GetOblicLinkHistoryEntry[],
  storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): boolean {
  if (!storage) {
    return false;
  }

  const limited = entries
    .map(normalizeEntry)
    .filter((entry): entry is GetOblicLinkHistoryEntry => entry != null)
    .slice(0, GETOBLIC_LINKS_HISTORY_LIMIT)
    .map((entry) => ({
      slug: entry.slug,
      short_url: entry.short_url,
      url: entry.url,
      template: entry.template,
      created_at: entry.created_at,
      label: entry.label ?? null,
      missing: entry.missing === true ? true : undefined,
      disabled: entry.disabled,
      click_count: entry.click_count,
    }));

  try {
    storage.setItem(
      getOblicLinksHistoryStorageKey(organizationId, userId),
      JSON.stringify(limited),
    );
    return true;
  } catch {
    return false;
  }
}

export function upsertGetOblicLinkHistoryEntry(
  organizationId: string,
  userId: string,
  entry: GetOblicLinkHistoryEntry,
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof localStorage !== "undefined" ? localStorage : null,
): GetOblicLinkHistoryEntry[] {
  const existing = readGetOblicLinksHistory(organizationId, userId, storage);
  const next = [
    entry,
    ...existing.filter((item) => item.slug !== entry.slug),
  ].slice(0, GETOBLIC_LINKS_HISTORY_LIMIT);
  writeGetOblicLinksHistory(organizationId, userId, next, storage);
  return next;
}

export function removeGetOblicLinkHistoryEntry(
  organizationId: string,
  userId: string,
  slug: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof localStorage !== "undefined" ? localStorage : null,
): GetOblicLinkHistoryEntry[] {
  const next = readGetOblicLinksHistory(organizationId, userId, storage).filter(
    (entry) => entry.slug !== slug,
  );
  writeGetOblicLinksHistory(organizationId, userId, next, storage);
  return next;
}

export function markGetOblicLinkHistoryMissing(
  organizationId: string,
  userId: string,
  slug: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null =
    typeof localStorage !== "undefined" ? localStorage : null,
): GetOblicLinkHistoryEntry[] {
  const next = readGetOblicLinksHistory(organizationId, userId, storage).map(
    (entry) =>
      entry.slug === slug
        ? {
            ...entry,
            missing: true,
            disabled: true,
          }
        : entry,
  );
  writeGetOblicLinksHistory(organizationId, userId, next, storage);
  return next;
}

export function filterGetOblicLinkHistory(
  entries: GetOblicLinkHistoryEntry[],
  options: {
    query?: string;
    template?: GetOblicLinkTemplateId | "all";
    status?: "all" | "enabled" | "disabled" | "missing";
  },
): GetOblicLinkHistoryEntry[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const template = options.template ?? "all";
  const status = options.status ?? "all";

  return entries.filter((entry) => {
    if (template !== "all" && entry.template !== template) {
      return false;
    }
    if (status === "missing" && !entry.missing) {
      return false;
    }
    if (status === "enabled" && (entry.missing || entry.disabled === true)) {
      return false;
    }
    if (status === "disabled" && (entry.missing || entry.disabled !== true)) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      entry.slug,
      entry.short_url,
      entry.url,
      entry.label ?? "",
      entry.template,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}
