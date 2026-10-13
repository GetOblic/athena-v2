import { createHash, randomBytes } from "node:crypto";
import {
  COMMUNITY_DISCOVERY_LEDGER_IN_FLIGHT_MS,
  COMMUNITY_DISCOVERY_LEDGER_MAX_ENTRIES,
  COMMUNITY_DISCOVERY_LEDGER_TTL_MS,
  COMMUNITY_DISCOVERY_MAX_SEARCH_PAGES,
} from "@/services/communityDiscovery/communityDiscoveryLimits";

/**
 * Process-local continuation ledger for one Node process.
 * It expires in memory. It is not distributed and it does not survive a restart.
 * Entries store an organization id, an objective hash, page slots, and canonical
 * identities. They do not store the search text, listing copy, model output, or Brain context.
 */

const MAX_SEEN_IDENTITIES = 40;
const IDENTITY_MAX_LENGTH = 200;

type LedgerEntry = {
  key: string;
  organizationId: string;
  objectiveHash: string;
  consumedPages: number[];
  seenIdentities: string[];
  continuationToken: string | null;
  sessionToken: string;
  inFlightPage: number | null;
  inFlightUntil: number;
  holdId: string | null;
  expiresAt: number;
  createdAt: number;
};

export type CommunityDiscoveryHold = {
  id: string;
  page: number;
  seenIdentities: readonly string[];
};

export type CommunityDiscoveryAcquisition =
  | { status: "acquired"; hold: CommunityDiscoveryHold }
  | { status: "recovery" }
  | { status: "in_flight" }
  | { status: "exhausted" }
  | { status: "invalid_token" };

export type CommunityDiscoveryCommit = {
  continuationToken: string | null;
  sessionToken: string;
  exhausted: boolean;
};

export type CommunityDiscoveryLedgerDebug = {
  size: number;
  records: Array<{
    organizationId: string;
    objectiveHash: string;
    consumedPages: number[];
    seenIdentities: string[];
    inFlightPage: number | null;
  }>;
};

export type CommunityDiscoveryLedger = {
  acquire(input: {
    organizationId: string;
    objective: string;
    continuationToken: string | null;
  }): CommunityDiscoveryAcquisition;
  commit(input: {
    holdId: string;
    identities: readonly string[];
    moreAvailable: boolean;
  }): CommunityDiscoveryCommit | null;
  release(holdId: string): void;
  restore(input: { organizationId: string; sessionToken: string }): "active" | "lost";
  size(): number;
  debug(): CommunityDiscoveryLedgerDebug;
};

function objectiveHash(objective: string): string {
  return createHash("sha256").update(objective).digest("hex");
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function rememberIdentity(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > IDENTITY_MAX_LENGTH) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function nextPage(entry: LedgerEntry): number | null {
  for (let page = 0; page < COMMUNITY_DISCOVERY_MAX_SEARCH_PAGES; page += 1) {
    if (!entry.consumedPages.includes(page)) return page;
  }
  return null;
}

export function createCommunityDiscoveryLedger(options?: {
  ttlMs?: number;
  maxEntries?: number;
  inFlightMs?: number;
  now?: () => number;
}): CommunityDiscoveryLedger {
  const ttlMs = options?.ttlMs ?? COMMUNITY_DISCOVERY_LEDGER_TTL_MS;
  const maxEntries = options?.maxEntries ?? COMMUNITY_DISCOVERY_LEDGER_MAX_ENTRIES;
  const inFlightMs = options?.inFlightMs ?? COMMUNITY_DISCOVERY_LEDGER_IN_FLIGHT_MS;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, LedgerEntry>();
  const continuationIndex = new Map<string, string>();
  const sessionIndex = new Map<string, string>();

  function drop(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    if (entry.continuationToken) continuationIndex.delete(entry.continuationToken);
    sessionIndex.delete(entry.sessionToken);
    entries.delete(key);
  }

  function purge(): void {
    const time = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= time) drop(key);
    }
    while (entries.size > maxEntries) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      let oldestInFlight: string | null = null;
      let oldestInFlightAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of entries) {
        const busy = entry.inFlightPage !== null && entry.inFlightUntil > time;
        if (!busy && entry.createdAt < oldestAt) {
          oldestAt = entry.createdAt;
          oldestKey = key;
        }
        if (entry.createdAt < oldestInFlightAt) {
          oldestInFlightAt = entry.createdAt;
          oldestInFlight = key;
        }
      }
      const target = oldestKey ?? oldestInFlight;
      if (!target) break;
      drop(target);
    }
  }

  function holdFor(entry: LedgerEntry, page: number): CommunityDiscoveryHold {
    const id = opaqueToken();
    entry.inFlightPage = page;
    entry.inFlightUntil = now() + inFlightMs;
    entry.holdId = id;
    return {
      id,
      page,
      seenIdentities: [...entry.seenIdentities],
    };
  }

  function entryForHold(holdId: string): LedgerEntry | null {
    for (const entry of entries.values()) {
      if (entry.holdId === holdId) return entry;
    }
    return null;
  }

  return {
    acquire(input) {
      purge();
      const hash = objectiveHash(input.objective);
      const time = now();
      if (input.continuationToken) {
        const key = continuationIndex.get(input.continuationToken);
        const entry = key ? entries.get(key) : undefined;
        if (
          !entry ||
          entry.organizationId !== input.organizationId ||
          entry.objectiveHash !== hash ||
          entry.expiresAt <= time
        ) {
          return { status: "invalid_token" };
        }
        if (entry.inFlightPage !== null && entry.inFlightUntil > time) {
          return { status: "in_flight" };
        }
        const page = nextPage(entry);
        if (page === null) return { status: "exhausted" };
        return { status: "acquired", hold: holdFor(entry, page) };
      }

      const key = `${input.organizationId}\n${hash}`;
      const existing = entries.get(key);
      if (existing && existing.expiresAt > time) {
        if (existing.inFlightPage !== null && existing.inFlightUntil > time) {
          return { status: "in_flight" };
        }
        if (existing.consumedPages.includes(0)) return { status: "recovery" };
        return { status: "acquired", hold: holdFor(existing, 0) };
      }
      if (existing) drop(key);

      const sessionToken = opaqueToken();
      const createdAt = time;
      const entry: LedgerEntry = {
        key,
        organizationId: input.organizationId,
        objectiveHash: hash,
        consumedPages: [],
        seenIdentities: [],
        continuationToken: null,
        sessionToken,
        inFlightPage: null,
        inFlightUntil: 0,
        holdId: null,
        expiresAt: createdAt + ttlMs,
        createdAt,
      };
      entries.set(key, entry);
      sessionIndex.set(sessionToken, key);
      if (entries.size > maxEntries) purge();
      return { status: "acquired", hold: holdFor(entries.get(key) ?? entry, 0) };
    },

    commit(input) {
      const entry = entryForHold(input.holdId);
      if (!entry || entry.inFlightPage === null) return null;
      const page = entry.inFlightPage;
      if (!entry.consumedPages.includes(page)) entry.consumedPages.push(page);
      for (const identity of input.identities) {
        const remembered = rememberIdentity(identity);
        if (!remembered || entry.seenIdentities.includes(remembered)) continue;
        if (entry.seenIdentities.length >= MAX_SEEN_IDENTITIES) break;
        entry.seenIdentities.push(remembered);
      }
      entry.inFlightPage = null;
      entry.inFlightUntil = 0;
      entry.holdId = null;
      const pagesLeft = nextPage(entry) !== null;
      const issue = input.moreAvailable && pagesLeft;
      if (issue) {
        if (entry.continuationToken) continuationIndex.delete(entry.continuationToken);
        const token = opaqueToken();
        entry.continuationToken = token;
        continuationIndex.set(token, entry.key);
      } else if (pagesLeft && entry.continuationToken) {
        continuationIndex.delete(entry.continuationToken);
        entry.continuationToken = null;
      }
      return {
        continuationToken: issue ? entry.continuationToken : null,
        sessionToken: entry.sessionToken,
        exhausted: !issue,
      };
    },

    release(holdId) {
      const entry = entryForHold(holdId);
      if (!entry) return;
      entry.inFlightPage = null;
      entry.inFlightUntil = 0;
      entry.holdId = null;
    },

    restore(input) {
      purge();
      const key = sessionIndex.get(input.sessionToken);
      const entry = key ? entries.get(key) : undefined;
      if (!entry || entry.organizationId !== input.organizationId) return "lost";
      if (entry.expiresAt <= now()) return "lost";
      return "active";
    },

    size() {
      purge();
      return entries.size;
    },

    debug() {
      return {
        size: entries.size,
        records: [...entries.values()].map((entry) => ({
          organizationId: entry.organizationId,
          objectiveHash: entry.objectiveHash,
          consumedPages: [...entry.consumedPages],
          seenIdentities: [...entry.seenIdentities],
          inFlightPage: entry.inFlightPage,
        })),
      };
    },
  };
}

let processLedger: CommunityDiscoveryLedger | null = null;

export function getCommunityDiscoveryLedger(): CommunityDiscoveryLedger {
  processLedger ??= createCommunityDiscoveryLedger();
  return processLedger;
}
