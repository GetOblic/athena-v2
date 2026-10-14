/**
 * Client-safe checks for a verified GetOblic listing permalink.
 * Accepts only the unchanged https://getoblic.com/ URL WordPress returned.
 * Rejects www, other hosts, and non-default ports. Does not build listing
 * URLs, rewrite the host, or add a language prefix.
 */

const BLOCKED_HOSTNAME_SUFFIXES = [
  "localhost",
  "localdomain",
  "local",
  "internal",
  "invalid",
  "test",
  "example",
  "home",
  "lan",
] as const;

function isBlockedPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host || host.endsWith(".") || host.startsWith("[") || host.includes(":")) {
    return true;
  }
  if (
    BLOCKED_HOSTNAME_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  ) {
    return true;
  }
  const labels = host.split(".");
  if (labels.length < 2) return true;
  if (labels.some((label) => label.length === 0 || label.length > 63)) {
    return true;
  }
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) return true;
  if (!/[a-z]/.test(host)) return true;
  const tld = labels[labels.length - 1] ?? "";
  return !/^[a-z]{2,}$/.test(tld);
}

/**
 * Unchanged https://getoblic.com/ URL with no userinfo and no explicit port.
 * Returns the trimmed permalink, or null when the host is anything else.
 */
export function readPublicHttpsListingPermalink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const permalink = value.trim();
  if (!permalink || /\s/.test(permalink) || permalink.includes("\\")) return null;
  if (!permalink.startsWith("https://")) return null;

  const authority = permalink.slice("https://".length).split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@")) return null;

  let url: URL;
  try {
    url = new URL(permalink);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || isBlockedPublicHostname(url.hostname)) return null;
  if (url.origin === "null") return null;
  if (!permalink.startsWith("https://getoblic.com/")) return null;
  if (url.hostname !== "getoblic.com") return null;
  if (url.port !== "") return null;
  return permalink;
}

export function readVerifiedGetOblicListingPermalink(
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.ok !== true) return null;
  return readPublicHttpsListingPermalink(record.permalink);
}
