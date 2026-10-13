/**
 * Ensure Prospect Funnel short links for one authenticated organization.
 * Destinations are supplied by the server resolver. Slugs are readable and
 * derived from the canonical URL contact_id. This module does not accept
 * browser-supplied URLs and does not write GetOblic Links history.
 */

import { GETOBLIC_SLUG_PATTERN } from "@/lib/getoblic-links/validation";
import {
  isProspectFunnelShortUrl,
  PROSPECT_FUNNEL_SHORT_LINK_CTAS,
  type ProspectFunnelShortLinkCta,
  type ProspectFunnelShortLinkMap,
} from "@/lib/prospects/prospectFunnelShortLinkDisplay";
import {
  ProspectFunnelShortLinkPersistenceError,
  ProspectFunnelWorkerError,
} from "@/services/prospects/prospectFunnelShortLinkErrors";

const ENSURE_PASSES = 5;
const MAX_SLUG_VERSION = 9;

const READABLE_SLUG_NAMES: Record<ProspectFunnelShortLinkCta, string> = {
  ai_agents: "ai-agents",
  virtual_phone: "virtual-phone",
  calendar: "calendar",
  claim_your_ai: "claim-ai",
};

export type ProspectFunnelUniqueConflict = "mapping" | "slug";

export class ProspectFunnelSlugConflictError extends Error {
  readonly code = "SLUG_CONFLICT" as const;

  constructor() {
    super("Prospect Funnel slug is already reserved.");
    this.name = "ProspectFunnelSlugConflictError";
  }
}

export type ProspectFunnelShortLinkLifecycle =
  | "pending"
  | "active"
  | "disabled"
  | "replacing";

export type ProspectFunnelReplacementPhase = "reserved" | "created";

export type ProspectFunnelShortLinkState = {
  destinationUrl: string;
  slug: string;
  shortUrl: string | null;
  lifecycle: ProspectFunnelShortLinkLifecycle;
  replacementDestinationUrl: string | null;
  replacementSlug: string | null;
  replacementShortUrl: string | null;
  replacementPhase: ProspectFunnelReplacementPhase | null;
};

export type ProspectFunnelShortLinkRow = ProspectFunnelShortLinkState & {
  id: string;
  organizationId: string;
  prospectId: string;
  ctaKey: ProspectFunnelShortLinkCta;
  generation: number;
};

export type ProspectFunnelShortLinkKey = {
  organizationId: string;
  prospectId: string;
  ctaKey: ProspectFunnelShortLinkCta;
};

export interface ProspectFunnelShortLinkStore {
  get(key: ProspectFunnelShortLinkKey): Promise<ProspectFunnelShortLinkRow | null>;
  insert(
    key: ProspectFunnelShortLinkKey,
    state: ProspectFunnelShortLinkState,
  ): Promise<
    | { status: "inserted"; row: ProspectFunnelShortLinkRow }
    | { status: "conflict"; conflict: ProspectFunnelUniqueConflict }
  >;
  compareAndSet(input: {
    key: ProspectFunnelShortLinkKey;
    expectedGeneration: number;
    next: ProspectFunnelShortLinkState;
  }): Promise<ProspectFunnelShortLinkRow | null>;
  delete(input: {
    key: ProspectFunnelShortLinkKey;
    expectedGeneration: number;
  }): Promise<boolean>;
}

export type ProspectFunnelWorkerLink = {
  slug: string;
  url: string;
  shortUrl: string;
  disabled: boolean;
};

export interface ProspectFunnelShortLinkWorker {
  create(input: {
    url: string;
    slug: string;
  }): Promise<ProspectFunnelWorkerLink>;
  get(slug: string): Promise<ProspectFunnelWorkerLink | null>;
  disable(slug: string): Promise<void>;
  enable(slug: string): Promise<void>;
}

type EnsureInput = {
  organizationId: string;
  prospectId: string;
  destinations: ProspectFunnelShortLinkMap;
  store: ProspectFunnelShortLinkStore;
  worker: ProspectFunnelShortLinkWorker;
};

type EnsureContext = {
  key: ProspectFunnelShortLinkKey;
  destination: string;
  listingId: string;
  store: ProspectFunnelShortLinkStore;
  worker: ProspectFunnelShortLinkWorker;
};

function logFailure(ctaKey: string, code: string): void {
  console.error("[PROSPECT_FUNNEL_LINKS] ensure_failed", { ctaKey, code });
}

function failureCode(error: unknown): string {
  if (error instanceof ProspectFunnelSlugConflictError) return error.code;
  if (error instanceof ProspectFunnelWorkerError) return error.code;
  if (error instanceof ProspectFunnelShortLinkPersistenceError) return error.code;
  return "WORKER_ERROR";
}

function isConflict(error: unknown): boolean {
  return error instanceof ProspectFunnelWorkerError && error.code === "CONFLICT";
}

function isNotFound(error: unknown): boolean {
  return error instanceof ProspectFunnelWorkerError && error.code === "NOT_FOUND";
}

function isSlugConflict(error: unknown): boolean {
  return error instanceof ProspectFunnelSlugConflictError;
}

function isCanonicalDestination(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === "claim.getoblic.com" &&
    url.username === "" &&
    url.password === "" &&
    url.hash === "" &&
    value.length <= 4000 &&
    !/[\s\u0000-\u001f]/.test(value)
  );
}

function normalizeDestination(value: string | null): string | null {
  if (!value || !isCanonicalDestination(value)) return null;
  return value;
}

function urlsEqual(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
}

function readDestinationListingId(destination: string): string | null {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return null;
  }
  const contactId = url.searchParams.get("contact_id");
  if (!contactId || !/^[1-9]\d{0,15}$/.test(contactId)) return null;
  const numeric = Number(contactId);
  if (!Number.isSafeInteger(numeric) || numeric <= 0 || String(numeric) !== contactId) {
    return null;
  }
  return contactId;
}

function readableSlug(
  ctaKey: ProspectFunnelShortLinkCta,
  listingId: string,
  version: number,
): string | null {
  if (!Number.isInteger(version) || version < 1 || version > MAX_SLUG_VERSION) {
    return null;
  }
  const slug =
    version === 1
      ? `${READABLE_SLUG_NAMES[ctaKey]}-${listingId}`
      : `${READABLE_SLUG_NAMES[ctaKey]}-${listingId}-${version}`;
  if (!GETOBLIC_SLUG_PATTERN.test(slug) || !/^[a-z0-9-]+$/.test(slug)) return null;
  return slug;
}

function readableSlugVersion(
  slug: string,
  ctaKey: ProspectFunnelShortLinkCta,
  listingId: string,
): number | null {
  const base = readableSlug(ctaKey, listingId, 1);
  if (!base) return null;
  if (slug === base) return 1;
  if (!slug.startsWith(`${base}-`)) return null;
  const suffix = slug.slice(base.length + 1);
  if (!/^[2-9]$/.test(suffix)) return null;
  return Number(suffix);
}

function firstReplacementVersion(
  currentSlug: string,
  ctaKey: ProspectFunnelShortLinkCta,
  listingId: string,
  destinationChanged: boolean,
): number | null {
  if (destinationChanged) {
    const current = readableSlugVersion(currentSlug, ctaKey, listingId);
    if (current != null) {
      return current >= MAX_SLUG_VERSION ? null : current + 1;
    }
  }
  return 1;
}

function pendingState(destinationUrl: string, slug: string): ProspectFunnelShortLinkState {
  return {
    destinationUrl,
    slug,
    shortUrl: null,
    lifecycle: "pending",
    replacementDestinationUrl: null,
    replacementSlug: null,
    replacementShortUrl: null,
    replacementPhase: null,
  };
}

function activeState(
  destinationUrl: string,
  slug: string,
  shortUrl: string,
): ProspectFunnelShortLinkState {
  return {
    destinationUrl,
    slug,
    shortUrl,
    lifecycle: "active",
    replacementDestinationUrl: null,
    replacementSlug: null,
    replacementShortUrl: null,
    replacementPhase: null,
  };
}

function disabledState(
  destinationUrl: string,
  slug: string,
  shortUrl: string,
): ProspectFunnelShortLinkState {
  return {
    destinationUrl,
    slug,
    shortUrl,
    lifecycle: "disabled",
    replacementDestinationUrl: null,
    replacementSlug: null,
    replacementShortUrl: null,
    replacementPhase: null,
  };
}

function replacingState(input: {
  destinationUrl: string;
  slug: string;
  shortUrl: string;
  replacementDestinationUrl: string;
  replacementSlug: string;
  replacementShortUrl: string | null;
  replacementPhase: ProspectFunnelReplacementPhase;
}): ProspectFunnelShortLinkState {
  return {
    destinationUrl: input.destinationUrl,
    slug: input.slug,
    shortUrl: input.shortUrl,
    lifecycle: "replacing",
    replacementDestinationUrl: input.replacementDestinationUrl,
    replacementSlug: input.replacementSlug,
    replacementShortUrl: input.replacementShortUrl,
    replacementPhase: input.replacementPhase,
  };
}

function isReusableWorkerLink(
  link: ProspectFunnelWorkerLink | null,
  slug: string,
  destination: string,
): link is ProspectFunnelWorkerLink {
  return Boolean(
    link &&
      !link.disabled &&
      link.slug === slug &&
      urlsEqual(link.url, destination) &&
      isProspectFunnelShortUrl(link.shortUrl),
  );
}

/**
 * Disable a Worker link only when it still points at the destination this
 * mapping published. A slug match with a different destination is left alone.
 */
async function disableOwnedLink(
  worker: ProspectFunnelShortLinkWorker,
  slug: string,
  expectedUrl: string,
): Promise<"retired" | "foreign"> {
  const existing = await worker.get(slug);
  if (!existing) return "retired";
  if (existing.slug !== slug || !urlsEqual(existing.url, expectedUrl)) {
    return "foreign";
  }
  if (!existing.disabled) {
    await worker.disable(slug);
  }
  return "retired";
}

type CreatedSlug = {
  status: "ready";
  slug: string;
  shortUrl: string;
  generation: number;
};

type CreateSlugResult =
  | CreatedSlug
  | { status: "stale" }
  | { status: "unavailable" }
  | { status: "exhausted" };

async function reserveNextSlug(input: {
  ctaKey: ProspectFunnelShortLinkCta;
  listingId: string;
  afterVersion: number;
  generation: number;
  assignSlug: (
    nextSlug: string,
    generation: number,
  ) => Promise<{ slug: string; generation: number } | null>;
}): Promise<
  | { status: "reserved"; slug: string; generation: number }
  | { status: "stale" }
  | { status: "exhausted" }
> {
  for (let version = input.afterVersion + 1; version <= MAX_SLUG_VERSION; version += 1) {
    const slug = readableSlug(input.ctaKey, input.listingId, version);
    if (!slug) return { status: "exhausted" };
    try {
      const assigned = await input.assignSlug(slug, input.generation);
      if (!assigned) return { status: "stale" };
      return { status: "reserved", slug: assigned.slug, generation: assigned.generation };
    } catch (error) {
      if (isSlugConflict(error)) continue;
      throw error;
    }
  }
  return { status: "exhausted" };
}

async function createAtSlug(input: {
  ctx: EnsureContext;
  slug: string;
  generation: number;
  assignSlug: (
    nextSlug: string,
    generation: number,
  ) => Promise<{ slug: string; generation: number } | null>;
}): Promise<CreateSlugResult> {
  let slug = input.slug;
  let generation = input.generation;

  for (let attempt = 0; attempt < MAX_SLUG_VERSION; attempt += 1) {
    const version = readableSlugVersion(slug, input.ctx.key.ctaKey, input.ctx.listingId);
    if (version == null) return { status: "exhausted" };

    let needsNext = false;
    try {
      const created = await input.ctx.worker.create({
        url: input.ctx.destination,
        slug,
      });
      if (isReusableWorkerLink(created, slug, input.ctx.destination)) {
        return { status: "ready", slug, shortUrl: created.shortUrl, generation };
      }
      needsNext = true;
    } catch (error) {
      if (!isConflict(error)) {
        logFailure(input.ctx.key.ctaKey, failureCode(error));
        return { status: "unavailable" };
      }
      let existing: ProspectFunnelWorkerLink | null;
      try {
        existing = await input.ctx.worker.get(slug);
      } catch (getError) {
        logFailure(input.ctx.key.ctaKey, failureCode(getError));
        return { status: "unavailable" };
      }
      if (isReusableWorkerLink(existing, slug, input.ctx.destination)) {
        return { status: "ready", slug, shortUrl: existing.shortUrl, generation };
      }
      needsNext = true;
    }

    if (!needsNext) return { status: "unavailable" };
    const reserved = await reserveNextSlug({
      ctaKey: input.ctx.key.ctaKey,
      listingId: input.ctx.listingId,
      afterVersion: version,
      generation,
      assignSlug: input.assignSlug,
    });
    if (reserved.status !== "reserved") return reserved;
    slug = reserved.slug;
    generation = reserved.generation;
  }

  return { status: "exhausted" };
}

async function insertPending(ctx: EnsureContext): Promise<
  | { status: "inserted"; row: ProspectFunnelShortLinkRow }
  | { status: "mapping" }
  | { status: "exhausted" }
> {
  for (let version = 1; version <= MAX_SLUG_VERSION; version += 1) {
    const slug = readableSlug(ctx.key.ctaKey, ctx.listingId, version);
    if (!slug) return { status: "exhausted" };
    const inserted = await ctx.store.insert(ctx.key, pendingState(ctx.destination, slug));
    if (inserted.status === "inserted") return inserted;
    if (inserted.conflict === "mapping") return { status: "mapping" };
  }
  return { status: "exhausted" };
}

async function ensureCta(
  ctx: Omit<EnsureContext, "destination" | "listingId"> & { destination: string | null },
): Promise<string | null> {
  const destination = normalizeDestination(ctx.destination);
  const workerCtx = {
    key: ctx.key,
    store: ctx.store,
    worker: ctx.worker,
  };

  for (let pass = 0; pass < ENSURE_PASSES; pass += 1) {
    const row = await ctx.store.get(ctx.key);
    if (!destination) {
      const retired = await retireUnauthorized(workerCtx, row);
      if (retired === "done") return null;
      continue;
    }

    const listingId = readDestinationListingId(destination);
    if (!listingId) return null;
    const ensured: EnsureContext = { ...workerCtx, destination, listingId };

    if (!row) {
      const inserted = await insertPending(ensured);
      if (inserted.status === "mapping") continue;
      if (inserted.status === "exhausted") {
        logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
        return null;
      }
      const published = await activatePending(ensured, inserted.row);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }

    if (
      row.lifecycle === "active" &&
      row.destinationUrl === destination &&
      readableSlugVersion(row.slug, ctx.key.ctaKey, listingId) != null &&
      isProspectFunnelShortUrl(row.shortUrl)
    ) {
      return row.shortUrl;
    }

    if (
      row.lifecycle === "disabled" &&
      row.destinationUrl === destination &&
      readableSlugVersion(row.slug, ctx.key.ctaKey, listingId) != null
    ) {
      const enabled = await reactivateDisabled(ensured, row);
      if (enabled === "stop") return null;
      if (enabled) return enabled;
      continue;
    }
    if (
      row.lifecycle === "pending" &&
      row.destinationUrl === destination &&
      readableSlugVersion(row.slug, ctx.key.ctaKey, listingId) != null
    ) {
      const published = await activatePending(ensured, row);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "pending" && row.destinationUrl === destination) {
      const moved = await movePendingToReadable(ensured, row);
      if (moved === "stop") return null;
      continue;
    }
    if (row.lifecycle === "pending") {
      await abandonPending(workerCtx, row);
      continue;
    }
    if (row.lifecycle === "replacing") {
      const published = await finishReplacement(ensured, row);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "active" && row.shortUrl) {
      const published = await startReplacement(ensured, row);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "disabled" && row.shortUrl) {
      const published = await startReplacement(ensured, row);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "disabled") {
      const moved = await movePendingToReadable(ensured, row);
      if (moved === "stop") return null;
      continue;
    }
  }

  return null;
}

async function movePendingToReadable(
  ctx: EnsureContext,
  row: ProspectFunnelShortLinkRow,
): Promise<"stop" | null> {
  const currentVersion = readableSlugVersion(row.slug, ctx.key.ctaKey, ctx.listingId);
  const start = currentVersion == null ? 1 : currentVersion + 1;
  for (let version = start; version <= MAX_SLUG_VERSION; version += 1) {
    const slug = readableSlug(ctx.key.ctaKey, ctx.listingId, version);
    if (!slug || slug === row.slug) continue;
    try {
      const updated = await ctx.store.compareAndSet({
        key: ctx.key,
        expectedGeneration: row.generation,
        next: pendingState(ctx.destination, slug),
      });
      if (!updated) return null;
      return null;
    } catch (error) {
      if (isSlugConflict(error)) continue;
      throw error;
    }
  }
  logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
  return "stop";
}

async function activatePending(
  ctx: EnsureContext,
  row: ProspectFunnelShortLinkRow,
): Promise<string | "stop" | null> {
  const created = await createAtSlug({
    ctx,
    slug: row.slug,
    generation: row.generation,
    assignSlug: async (nextSlug, generation) => {
      const updated = await ctx.store.compareAndSet({
        key: ctx.key,
        expectedGeneration: generation,
        next: pendingState(ctx.destination, nextSlug),
      });
      if (!updated) return null;
      return { slug: updated.slug, generation: updated.generation };
    },
  });
  if (created.status === "exhausted") {
    logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
    return "stop";
  }
  if (created.status === "unavailable") return "stop";
  if (created.status === "stale") return null;

  const promoted = await ctx.store.compareAndSet({
    key: ctx.key,
    expectedGeneration: created.generation,
    next: activeState(ctx.destination, created.slug, created.shortUrl),
  });
  if (promoted?.shortUrl) return promoted.shortUrl;

  const current = await ctx.store.get(ctx.key);
  if (
    current &&
    current.lifecycle === "active" &&
    current.destinationUrl === ctx.destination &&
    current.slug === created.slug &&
    isProspectFunnelShortUrl(current.shortUrl)
  ) {
    return current.shortUrl;
  }
  if (
    current &&
    current.slug !== created.slug &&
    current.replacementSlug !== created.slug
  ) {
    await disableOwnedLink(ctx.worker, created.slug, ctx.destination).catch((error: unknown) => {
      logFailure(ctx.key.ctaKey, failureCode(error));
    });
  }
  return null;
}

async function reactivateDisabled(
  ctx: EnsureContext,
  row: ProspectFunnelShortLinkRow,
): Promise<string | "stop" | null> {
  if (!isProspectFunnelShortUrl(row.shortUrl)) return null;
  let existing: ProspectFunnelWorkerLink | null;
  try {
    existing = await ctx.worker.get(row.slug);
  } catch (error) {
    if (!isNotFound(error)) {
      logFailure(ctx.key.ctaKey, failureCode(error));
      return "stop";
    }
    existing = null;
  }

  if (!existing) {
    await ctx.store.compareAndSet({
      key: ctx.key,
      expectedGeneration: row.generation,
      next: pendingState(ctx.destination, row.slug),
    });
    return null;
  }
  if (existing.slug !== row.slug || !urlsEqual(existing.url, ctx.destination)) {
    return movePendingToReadable(ctx, row);
  }

  if (existing.disabled) {
    try {
      await ctx.worker.enable(row.slug);
    } catch (error) {
      if (!isNotFound(error)) {
        logFailure(ctx.key.ctaKey, failureCode(error));
        return "stop";
      }
      await ctx.store.compareAndSet({
        key: ctx.key,
        expectedGeneration: row.generation,
        next: pendingState(ctx.destination, row.slug),
      });
      return null;
    }
  }

  const promoted = await ctx.store.compareAndSet({
    key: ctx.key,
    expectedGeneration: row.generation,
    next: activeState(ctx.destination, row.slug, row.shortUrl),
  });
  return promoted?.shortUrl ?? null;
}

async function startReplacement(
  ctx: EnsureContext,
  row: ProspectFunnelShortLinkRow,
): Promise<string | "stop" | null> {
  if (!row.shortUrl) return null;
  const destinationChanged = row.destinationUrl !== ctx.destination;
  const start = firstReplacementVersion(
    row.slug,
    ctx.key.ctaKey,
    ctx.listingId,
    destinationChanged,
  );
  if (start == null) {
    logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
    return "stop";
  }

  for (let version = start; version <= MAX_SLUG_VERSION; version += 1) {
    const slug = readableSlug(ctx.key.ctaKey, ctx.listingId, version);
    if (!slug || slug === row.slug) continue;
    try {
      const reserved = await ctx.store.compareAndSet({
        key: ctx.key,
        expectedGeneration: row.generation,
        next: replacingState({
          destinationUrl: row.destinationUrl,
          slug: row.slug,
          shortUrl: row.shortUrl,
          replacementDestinationUrl: ctx.destination,
          replacementSlug: slug,
          replacementShortUrl: null,
          replacementPhase: "reserved",
        }),
      });
      if (!reserved) return null;
      return finishReplacement(ctx, reserved);
    } catch (error) {
      if (isSlugConflict(error)) continue;
      throw error;
    }
  }

  logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
  return "stop";
}

async function finishReplacement(
  ctx: EnsureContext,
  row: ProspectFunnelShortLinkRow,
): Promise<string | "stop" | null> {
  const replacementSlug = row.replacementSlug;
  const previousShortUrl = row.shortUrl;
  if (
    row.lifecycle !== "replacing" ||
    !replacementSlug ||
    !row.replacementDestinationUrl ||
    !previousShortUrl
  ) {
    return null;
  }

  if (row.replacementDestinationUrl !== ctx.destination) {
    await disableOwnedLink(ctx.worker, replacementSlug, row.replacementDestinationUrl);
    await ctx.store.compareAndSet({
      key: ctx.key,
      expectedGeneration: row.generation,
      next: activeState(row.destinationUrl, row.slug, previousShortUrl),
    });
    return null;
  }

  const previous = {
    destinationUrl: row.destinationUrl,
    slug: row.slug,
    shortUrl: previousShortUrl,
  };
  let current = row;

  if (
    readableSlugVersion(replacementSlug, ctx.key.ctaKey, ctx.listingId) == null &&
    (current.replacementPhase !== "created" || !current.replacementShortUrl)
  ) {
    const start = firstReplacementVersion(current.slug, ctx.key.ctaKey, ctx.listingId, false);
    if (start == null) {
      logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
      return "stop";
    }
    let moved = false;
    for (let version = start; version <= MAX_SLUG_VERSION; version += 1) {
      const slug = readableSlug(ctx.key.ctaKey, ctx.listingId, version);
      if (!slug || slug === current.slug) continue;
      try {
        const updated = await ctx.store.compareAndSet({
          key: ctx.key,
          expectedGeneration: current.generation,
          next: replacingState({
            destinationUrl: previous.destinationUrl,
            slug: previous.slug,
            shortUrl: previous.shortUrl,
            replacementDestinationUrl: ctx.destination,
            replacementSlug: slug,
            replacementShortUrl: null,
            replacementPhase: "reserved",
          }),
        });
        if (!updated) return null;
        current = updated;
        moved = true;
        break;
      } catch (error) {
        if (isSlugConflict(error)) continue;
        throw error;
      }
    }
    if (!moved) {
      logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
      return "stop";
    }
  }

  if (current.replacementPhase !== "created" || !current.replacementShortUrl) {
    const nextReplacementSlug = current.replacementSlug;
    if (!nextReplacementSlug) return null;
    const created = await createAtSlug({
      ctx,
      slug: nextReplacementSlug,
      generation: current.generation,
      assignSlug: async (nextSlug, generation) => {
        const updated = await ctx.store.compareAndSet({
          key: ctx.key,
          expectedGeneration: generation,
          next: replacingState({
            destinationUrl: previous.destinationUrl,
            slug: previous.slug,
            shortUrl: previous.shortUrl,
            replacementDestinationUrl: ctx.destination,
            replacementSlug: nextSlug,
            replacementShortUrl: null,
            replacementPhase: "reserved",
          }),
        });
        if (!updated?.replacementSlug) return null;
        return {
          slug: updated.replacementSlug,
          generation: updated.generation,
        };
      },
    });
    if (created.status === "exhausted") {
      logFailure(ctx.key.ctaKey, "VERSION_EXHAUSTED");
      return "stop";
    }
    if (created.status === "unavailable") return "stop";
    if (created.status !== "ready") return null;
    const marked = await ctx.store.compareAndSet({
      key: ctx.key,
      expectedGeneration: created.generation,
      next: replacingState({
        destinationUrl: previous.destinationUrl,
        slug: previous.slug,
        shortUrl: previous.shortUrl,
        replacementDestinationUrl: ctx.destination,
        replacementSlug: created.slug,
        replacementShortUrl: created.shortUrl,
        replacementPhase: "created",
      }),
    });
    if (!marked) return null;
    current = marked;
  }

  if (!current.replacementSlug || !current.replacementShortUrl) return null;
  await disableOwnedLink(ctx.worker, previous.slug, previous.destinationUrl);
  const promoted = await ctx.store.compareAndSet({
    key: ctx.key,
    expectedGeneration: current.generation,
    next: activeState(ctx.destination, current.replacementSlug, current.replacementShortUrl),
  });
  if (promoted?.shortUrl) return promoted.shortUrl;

  const latest = await ctx.store.get(ctx.key);
  if (
    latest &&
    latest.lifecycle === "active" &&
    latest.destinationUrl === ctx.destination &&
    isProspectFunnelShortUrl(latest.shortUrl)
  ) {
    return latest.shortUrl;
  }
  return null;
}

async function abandonPending(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
  },
  row: ProspectFunnelShortLinkRow,
): Promise<void> {
  await disableOwnedLink(input.worker, row.slug, row.destinationUrl);
  await input.store.delete({
    key: input.key,
    expectedGeneration: row.generation,
  });
}

async function retireUnauthorized(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
  },
  row: ProspectFunnelShortLinkRow | null,
): Promise<"done" | "retry"> {
  if (!row || row.lifecycle === "disabled") return "done";

  if (row.lifecycle === "pending") {
    await disableOwnedLink(input.worker, row.slug, row.destinationUrl);
    const deleted = await input.store.delete({
      key: input.key,
      expectedGeneration: row.generation,
    });
    return deleted ? "done" : "retry";
  }

  if (row.lifecycle === "replacing") {
    await disableOwnedLink(input.worker, row.slug, row.destinationUrl);
    if (row.replacementSlug && row.replacementDestinationUrl) {
      await disableOwnedLink(
        input.worker,
        row.replacementSlug,
        row.replacementDestinationUrl,
      );
    }
    if (!row.shortUrl) return "retry";
    const disabled = await input.store.compareAndSet({
      key: input.key,
      expectedGeneration: row.generation,
      next: disabledState(row.destinationUrl, row.slug, row.shortUrl),
    });
    return disabled ? "done" : "retry";
  }

  if (!row.shortUrl) return "done";
  await disableOwnedLink(input.worker, row.slug, row.destinationUrl);
  const disabled = await input.store.compareAndSet({
    key: input.key,
    expectedGeneration: row.generation,
    next: disabledState(row.destinationUrl, row.slug, row.shortUrl),
  });
  return disabled ? "done" : "retry";
}

export async function ensureProspectFunnelShortLinks(
  input: EnsureInput,
): Promise<ProspectFunnelShortLinkMap> {
  const links: ProspectFunnelShortLinkMap = {
    ai_agents: null,
    virtual_phone: null,
    calendar: null,
    claim_your_ai: null,
  };

  for (const ctaKey of PROSPECT_FUNNEL_SHORT_LINK_CTAS) {
    try {
      links[ctaKey] = await ensureCta({
        key: {
          organizationId: input.organizationId,
          prospectId: input.prospectId,
          ctaKey,
        },
        destination: input.destinations[ctaKey],
        store: input.store,
        worker: input.worker,
      });
    } catch (error) {
      logFailure(ctaKey, failureCode(error));
      links[ctaKey] = null;
    }
  }

  return links;
}
