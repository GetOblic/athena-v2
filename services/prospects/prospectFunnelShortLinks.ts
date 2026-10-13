/**
 * Ensure Prospect Funnel short links for one authenticated organization.
 * Destinations are supplied by the server resolver. This module does not
 * accept browser-supplied URLs and does not write GetOblic Links history.
 */

import { randomBytes } from "node:crypto";
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
const SLUG_ATTEMPTS = 3;

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
    | { status: "conflict" }
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
  createSlug?: () => string;
};

export function createProspectFunnelSlug(): string {
  const slug = `pf_${randomBytes(18).toString("base64url")}`;
  if (!GETOBLIC_SLUG_PATTERN.test(slug)) {
    throw new Error("Prospect funnel slug generator produced an invalid slug.");
  }
  return slug;
}

function logFailure(ctaKey: string, code: string): void {
  console.error("[PROSPECT_FUNNEL_LINKS] ensure_failed", { ctaKey, code });
}

function failureCode(error: unknown): string {
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

function publishedShortUrl(row: ProspectFunnelShortLinkRow, destination: string): string | null {
  if (
    row.lifecycle === "active" &&
    row.destinationUrl === destination &&
    isProspectFunnelShortUrl(row.shortUrl)
  ) {
    return row.shortUrl;
  }
  return null;
}

type CreatedSlug = {
  status: "ready";
  slug: string;
  shortUrl: string;
  generation: number;
};

type CreateSlugResult = CreatedSlug | { status: "stale" } | { status: "unavailable" };

async function createAtSlug(input: {
  worker: ProspectFunnelShortLinkWorker;
  createSlug: () => string;
  ctaKey: string;
  destination: string;
  slug: string;
  generation: number;
  assignSlug: (
    nextSlug: string,
    generation: number,
  ) => Promise<{ slug: string; generation: number } | null>;
}): Promise<CreateSlugResult> {
  let slug = input.slug;
  let generation = input.generation;

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    try {
      const created = await input.worker.create({
        url: input.destination,
        slug,
      });
      const acceptable =
        !created.disabled &&
        created.slug === slug &&
        urlsEqual(created.url, input.destination) &&
        isProspectFunnelShortUrl(created.shortUrl);
      if (!acceptable) {
        if (created.slug) {
          await input.worker.disable(created.slug).catch(() => undefined);
        }
        const assigned = await input.assignSlug(input.createSlug(), generation);
        if (!assigned) return { status: "stale" };
        slug = assigned.slug;
        generation = assigned.generation;
        continue;
      }
      return { status: "ready", slug, shortUrl: created.shortUrl, generation };
    } catch (error) {
      if (!isConflict(error)) {
        logFailure(input.ctaKey, failureCode(error));
        return { status: "unavailable" };
      }
      let existing: ProspectFunnelWorkerLink | null;
      try {
        existing = await input.worker.get(slug);
      } catch (getError) {
        logFailure(input.ctaKey, failureCode(getError));
        return { status: "unavailable" };
      }
      if (
        existing &&
        !existing.disabled &&
        existing.slug === slug &&
        urlsEqual(existing.url, input.destination) &&
        isProspectFunnelShortUrl(existing.shortUrl)
      ) {
        return { status: "ready", slug, shortUrl: existing.shortUrl, generation };
      }
      const assigned = await input.assignSlug(input.createSlug(), generation);
      if (!assigned) return { status: "stale" };
      slug = assigned.slug;
      generation = assigned.generation;
    }
  }

  return { status: "unavailable" };
}

async function ensureCta(input: {
  key: ProspectFunnelShortLinkKey;
  destination: string | null;
  store: ProspectFunnelShortLinkStore;
  worker: ProspectFunnelShortLinkWorker;
  createSlug: () => string;
}): Promise<string | null> {
  const destination = normalizeDestination(input.destination);

  for (let pass = 0; pass < ENSURE_PASSES; pass += 1) {
    const row = await input.store.get(input.key);
    if (!destination) {
      const retired = await retireUnauthorized(input, row);
      if (retired === "done") return null;
      continue;
    }
    if (!row) {
      const inserted = await input.store.insert(
        input.key,
        pendingState(destination, input.createSlug()),
      );
      if (inserted.status === "conflict") continue;
      const published = await activatePending(input, inserted.row, destination);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }

    const current = publishedShortUrl(row, destination);
    if (current) return current;

    if (row.lifecycle === "disabled" && row.destinationUrl === destination) {
      const enabled = await reactivateDisabled(input, row, destination);
      if (enabled === "stop") return null;
      if (enabled) return enabled;
      continue;
    }
    if (row.lifecycle === "pending" && row.destinationUrl === destination) {
      const published = await activatePending(input, row, destination);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "pending") {
      await abandonPending(input, row);
      continue;
    }
    if (row.lifecycle === "replacing") {
      const published = await finishReplacement(input, row, destination);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "active" && row.shortUrl) {
      const published = await startReplacement(input, row, destination);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "disabled" && row.shortUrl) {
      const published = await replaceDisabled(input, row, destination);
      if (published === "stop") return null;
      if (published) return published;
      continue;
    }
    if (row.lifecycle === "disabled") {
      const moved = await input.store.compareAndSet({
        key: input.key,
        expectedGeneration: row.generation,
        next: pendingState(destination, input.createSlug()),
      });
      if (!moved) continue;
      continue;
    }
  }

  return null;
}

async function activatePending(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
    createSlug: () => string;
  },
  row: ProspectFunnelShortLinkRow,
  destination: string,
): Promise<string | "stop" | null> {
  const created = await createAtSlug({
    worker: input.worker,
    createSlug: input.createSlug,
    ctaKey: input.key.ctaKey,
    destination,
    slug: row.slug,
    generation: row.generation,
    assignSlug: async (nextSlug, generation) => {
      const updated = await input.store.compareAndSet({
        key: input.key,
        expectedGeneration: generation,
        next: pendingState(destination, nextSlug),
      });
      if (!updated) return null;
      return { slug: updated.slug, generation: updated.generation };
    },
  });
  if (created.status === "unavailable") return "stop";
  if (created.status === "stale") return null;

  const promoted = await input.store.compareAndSet({
    key: input.key,
    expectedGeneration: created.generation,
    next: activeState(destination, created.slug, created.shortUrl),
  });
  if (promoted?.shortUrl) return promoted.shortUrl;

  const current = await input.store.get(input.key);
  if (
    current &&
    current.lifecycle === "active" &&
    current.destinationUrl === destination &&
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
    await input.worker.disable(created.slug).catch((error: unknown) => {
      logFailure(input.key.ctaKey, failureCode(error));
    });
  }
  return null;
}

async function reactivateDisabled(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
    createSlug: () => string;
  },
  row: ProspectFunnelShortLinkRow,
  destination: string,
): Promise<string | "stop" | null> {
  if (!isProspectFunnelShortUrl(row.shortUrl)) return null;
  try {
    await input.worker.enable(row.slug);
  } catch (error) {
    if (!isNotFound(error)) {
      logFailure(input.key.ctaKey, failureCode(error));
      return "stop";
    }
    await input.store.compareAndSet({
      key: input.key,
      expectedGeneration: row.generation,
      next: pendingState(destination, input.createSlug()),
    });
    return null;
  }

  const promoted = await input.store.compareAndSet({
    key: input.key,
    expectedGeneration: row.generation,
    next: activeState(destination, row.slug, row.shortUrl),
  });
  return promoted?.shortUrl ?? null;
}

async function startReplacement(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
    createSlug: () => string;
  },
  row: ProspectFunnelShortLinkRow,
  destination: string,
): Promise<string | "stop" | null> {
  if (!row.shortUrl) return null;
  const reserved = await input.store.compareAndSet({
    key: input.key,
    expectedGeneration: row.generation,
    next: replacingState({
      destinationUrl: row.destinationUrl,
      slug: row.slug,
      shortUrl: row.shortUrl,
      replacementDestinationUrl: destination,
      replacementSlug: input.createSlug(),
      replacementShortUrl: null,
      replacementPhase: "reserved",
    }),
  });
  if (!reserved) return null;
  return finishReplacement(input, reserved, destination);
}

async function replaceDisabled(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
    createSlug: () => string;
  },
  row: ProspectFunnelShortLinkRow,
  destination: string,
): Promise<string | "stop" | null> {
  if (!row.shortUrl) return null;
  const reserved = await input.store.compareAndSet({
    key: input.key,
    expectedGeneration: row.generation,
    next: replacingState({
      destinationUrl: row.destinationUrl,
      slug: row.slug,
      shortUrl: row.shortUrl,
      replacementDestinationUrl: destination,
      replacementSlug: input.createSlug(),
      replacementShortUrl: null,
      replacementPhase: "reserved",
    }),
  });
  if (!reserved) return null;
  return finishReplacement(input, reserved, destination);
}

async function finishReplacement(
  input: {
    key: ProspectFunnelShortLinkKey;
    store: ProspectFunnelShortLinkStore;
    worker: ProspectFunnelShortLinkWorker;
    createSlug: () => string;
  },
  row: ProspectFunnelShortLinkRow,
  destination: string,
): Promise<string | "stop" | null> {
  const replacementSlug = row.replacementSlug;
  const publishedShortUrl = row.shortUrl;
  if (
    row.lifecycle !== "replacing" ||
    !replacementSlug ||
    !row.replacementDestinationUrl ||
    !publishedShortUrl
  ) {
    return null;
  }

  if (row.replacementDestinationUrl !== destination) {
    await input.worker.disable(replacementSlug);
    await input.store.compareAndSet({
      key: input.key,
      expectedGeneration: row.generation,
      next: activeState(row.destinationUrl, row.slug, publishedShortUrl),
    });
    return null;
  }

  const published = {
    destinationUrl: row.destinationUrl,
    slug: row.slug,
    shortUrl: publishedShortUrl,
  };
  let current = row;

  if (current.replacementPhase !== "created" || !current.replacementShortUrl) {
    const created = await createAtSlug({
      worker: input.worker,
      createSlug: input.createSlug,
      ctaKey: input.key.ctaKey,
      destination,
      slug: replacementSlug,
      generation: current.generation,
      assignSlug: async (nextSlug, generation) => {
        const updated = await input.store.compareAndSet({
          key: input.key,
          expectedGeneration: generation,
          next: replacingState({
            destinationUrl: published.destinationUrl,
            slug: published.slug,
            shortUrl: published.shortUrl,
            replacementDestinationUrl: destination,
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
    if (created.status === "unavailable") return "stop";
    if (created.status !== "ready") return null;
    const marked = await input.store.compareAndSet({
      key: input.key,
      expectedGeneration: created.generation,
      next: replacingState({
        destinationUrl: published.destinationUrl,
        slug: published.slug,
        shortUrl: published.shortUrl,
        replacementDestinationUrl: destination,
        replacementSlug: created.slug,
        replacementShortUrl: created.shortUrl,
        replacementPhase: "created",
      }),
    });
    if (!marked) return null;
    current = marked;
  }

  if (!current.replacementSlug || !current.replacementShortUrl) return null;
  await input.worker.disable(published.slug);
  const promoted = await input.store.compareAndSet({
    key: input.key,
    expectedGeneration: current.generation,
    next: activeState(destination, current.replacementSlug, current.replacementShortUrl),
  });
  if (promoted?.shortUrl) return promoted.shortUrl;

  const latest = await input.store.get(input.key);
  if (
    latest &&
    latest.lifecycle === "active" &&
    latest.destinationUrl === destination &&
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
  await input.worker.disable(row.slug);
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
    await input.worker.disable(row.slug);
    const deleted = await input.store.delete({
      key: input.key,
      expectedGeneration: row.generation,
    });
    return deleted ? "done" : "retry";
  }

  if (row.lifecycle === "replacing") {
    await input.worker.disable(row.slug);
    if (row.replacementSlug) {
      await input.worker.disable(row.replacementSlug);
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
  await input.worker.disable(row.slug);
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
  const createSlug = input.createSlug ?? createProspectFunnelSlug;
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
        createSlug,
      });
    } catch (error) {
      logFailure(ctaKey, failureCode(error));
      links[ctaKey] = null;
    }
  }

  return links;
}
