/**
 * FUNNEL-LINKS-2 — readable Prospect Funnel short links.
 * No live Worker calls and no database connection.
 */

import "./prospectFunnelShortLinkTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { GETOBLIC_SLUG_PATTERN } from "../../lib/getoblic-links/validation";
import {
  buildGetOblicFunnelCallHref,
  buildGetOblicFunnelClaimHref,
  buildGetOblicFunnelPresentation,
} from "../../lib/prospects/getOblicFunnelPresentation";
import { resolveProspectFunnelEnsureContext } from "../../services/prospects/prospectFunnelCanonicalDestinations";
import {
  ProspectFunnelShortLinkPersistenceError,
  ProspectFunnelWorkerError,
} from "../../services/prospects/prospectFunnelShortLinkErrors";
import { classifyProspectFunnelUniqueViolation } from "../../services/prospects/prospectFunnelShortLinkPersistence";
import {
  ensureProspectFunnelShortLinks,
  ProspectFunnelSlugConflictError,
  type ProspectFunnelShortLinkCta,
  type ProspectFunnelShortLinkKey,
  type ProspectFunnelShortLinkRow,
  type ProspectFunnelShortLinkState,
  type ProspectFunnelShortLinkStore,
  type ProspectFunnelWorkerLink,
} from "../../services/prospects/prospectFunnelShortLinks";
import { createProspectFunnelShortLinkWorker } from "../../services/prospects/prospectFunnelShortLinkWorker";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const AUTHOR = 123456789;
const CONTACT = 9001;
const LISTING = 946970;
const BUSINESS = "North & West = Clinic";
const AI = `ai-agents-${CONTACT}`;
const PHONE = `virtual-phone-${CONTACT}`;
const CAL = `calendar-${CONTACT}`;
const CLAIM = `claim-ai-${LISTING}`;

function short(slug: string): string {
  return `https://link.getoblic.com/${slug}`;
}

function versioned(base: string): string[] {
  return [base, ...Array.from({ length: 8 }, (_, index) => `${base}-${index + 2}`)];
}

function canonical(language: "fr" | "de") {
  const presentation = buildGetOblicFunnelPresentation({
    authorId: AUTHOR,
    contactId: CONTACT,
    businessName: BUSINESS,
    licenseeDefaultLanguage: language,
  });
  assert.ok(presentation);
  return {
    ai_agents: presentation.aiAgentsHref,
    virtual_phone: presentation.virtualPhoneHref,
    calendar: presentation.calendarHref,
    claim_your_ai: buildGetOblicFunnelClaimHref({
      authorId: AUTHOR,
      listingId: LISTING,
      businessName: BUSINESS,
      licenseeDefaultLanguage: language,
    }),
    call: buildGetOblicFunnelCallHref({
      listingId: LISTING,
      licenseeDefaultLanguage: language,
    }),
  };
}

function emptyDestinations() {
  return {
    ai_agents: null,
    virtual_phone: null,
    calendar: null,
    claim_your_ai: null,
  };
}

function createMemoryStore(): ProspectFunnelShortLinkStore & {
  rows(): ProspectFunnelShortLinkRow[];
  failNextActivePromotes: number;
  mappingConflicts: number;
  seed(row: ProspectFunnelShortLinkRow): void;
} {
  const rows = new Map<string, ProspectFunnelShortLinkRow>();
  const store = {
    failNextActivePromotes: 0,
    mappingConflicts: 0,
    rows() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    seed(row: ProspectFunnelShortLinkRow) {
      rows.set(storageKey(row), { ...row });
    },
    async get(key: ProspectFunnelShortLinkKey) {
      await Promise.resolve();
      const row = rows.get(storageKey(key));
      return row ? { ...row } : null;
    },
    async insert(key: ProspectFunnelShortLinkKey, state: ProspectFunnelShortLinkState) {
      if (store.mappingConflicts > 0) {
        store.mappingConflicts -= 1;
        return { status: "conflict" as const, conflict: "mapping" as const };
      }
      if (rows.has(storageKey(key))) {
        return { status: "conflict" as const, conflict: "mapping" as const };
      }
      if (slugReserved(rows, state, null)) {
        return { status: "conflict" as const, conflict: "slug" as const };
      }
      const row: ProspectFunnelShortLinkRow = {
        ...state,
        id: randomUUID(),
        organizationId: key.organizationId,
        prospectId: key.prospectId,
        ctaKey: key.ctaKey,
        generation: 1,
      };
      rows.set(storageKey(key), row);
      return { status: "inserted" as const, row: { ...row } };
    },
    async compareAndSet(input: {
      key: ProspectFunnelShortLinkKey;
      expectedGeneration: number;
      next: ProspectFunnelShortLinkState;
    }) {
      const current = rows.get(storageKey(input.key));
      if (!current || current.generation !== input.expectedGeneration) return null;
      if (slugReserved(rows, input.next, current.id)) {
        throw new ProspectFunnelSlugConflictError();
      }
      if (store.failNextActivePromotes > 0 && input.next.lifecycle === "active") {
        store.failNextActivePromotes -= 1;
        throw new ProspectFunnelShortLinkPersistenceError();
      }
      const next: ProspectFunnelShortLinkRow = {
        ...current,
        ...input.next,
        generation: current.generation + 1,
      };
      rows.set(storageKey(input.key), next);
      return { ...next };
    },
    async delete(input: {
      key: ProspectFunnelShortLinkKey;
      expectedGeneration: number;
    }) {
      const current = rows.get(storageKey(input.key));
      if (!current || current.generation !== input.expectedGeneration) return false;
      rows.delete(storageKey(input.key));
      return true;
    },
  };
  return store;
}

function storageKey(key: ProspectFunnelShortLinkKey): string {
  return `${key.organizationId}\n${key.prospectId}\n${key.ctaKey}`;
}

function slugReserved(
  rows: Map<string, ProspectFunnelShortLinkRow>,
  state: ProspectFunnelShortLinkState,
  exceptId: string | null,
): boolean {
  for (const row of rows.values()) {
    if (exceptId && row.id === exceptId) continue;
    if (row.slug === state.slug) return true;
    if (state.replacementSlug && row.replacementSlug === state.replacementSlug) {
      return true;
    }
  }
  return false;
}

function createWorker() {
  const links = new Map<string, { url: string; disabled: boolean }>();
  const ops: Array<{ op: "create" | "get" | "disable" | "enable"; slug: string }> = [];
  const attempted: string[] = [];
  const workerState = {
    failCreates: 0,
    failDisables: 0,
    acceptThenTimeout: false,
    createError: null as ProspectFunnelWorkerError | null,
  };

  function view(slug: string): ProspectFunnelWorkerLink {
    const link = links.get(slug);
    if (!link) {
      throw new ProspectFunnelWorkerError("NOT_FOUND", "missing");
    }
    return {
      slug,
      url: link.url,
      shortUrl: short(slug),
      disabled: link.disabled,
    };
  }

  return {
    links,
    ops,
    attempted,
    workerState,
    worker: {
      async create(input: { url: string; slug: string }) {
        attempted.push(input.slug);
        if (workerState.createError) {
          const error = workerState.createError;
          workerState.createError = null;
          throw error;
        }
        if (workerState.failCreates > 0) {
          workerState.failCreates -= 1;
          throw new ProspectFunnelWorkerError("TIMEOUT", "GetOblic Links timed out.");
        }
        if (links.has(input.slug)) {
          throw new ProspectFunnelWorkerError("CONFLICT", "slug exists");
        }
        links.set(input.slug, { url: input.url, disabled: false });
        ops.push({ op: "create", slug: input.slug });
        if (workerState.acceptThenTimeout) {
          workerState.acceptThenTimeout = false;
          throw new ProspectFunnelWorkerError("TIMEOUT", "GetOblic Links timed out.");
        }
        await Promise.resolve();
        return view(input.slug);
      },
      async get(slug: string) {
        ops.push({ op: "get", slug });
        if (!links.has(slug)) return null;
        return view(slug);
      },
      async disable(slug: string) {
        ops.push({ op: "disable", slug });
        if (workerState.failDisables > 0) {
          workerState.failDisables -= 1;
          throw new ProspectFunnelWorkerError("TIMEOUT", "GetOblic Links timed out.");
        }
        const link = links.get(slug);
        if (!link) return;
        link.disabled = true;
      },
      async enable(slug: string) {
        ops.push({ op: "enable", slug });
        const link = links.get(slug);
        if (!link) throw new ProspectFunnelWorkerError("NOT_FOUND", "missing");
        link.disabled = false;
      },
    },
  };
}

function activeSeed(input: {
  organizationId?: string;
  prospectId?: string;
  ctaKey?: ProspectFunnelShortLinkCta;
  destinationUrl: string;
  slug: string;
  generation?: number;
}): ProspectFunnelShortLinkRow {
  return {
    id: randomUUID(),
    organizationId: input.organizationId ?? "org-a",
    prospectId: input.prospectId ?? "prospect-other",
    ctaKey: input.ctaKey ?? "ai_agents",
    destinationUrl: input.destinationUrl,
    slug: input.slug,
    shortUrl: short(input.slug),
    lifecycle: "active",
    replacementDestinationUrl: null,
    replacementSlug: null,
    replacementShortUrl: null,
    replacementPhase: null,
    generation: input.generation ?? 2,
  };
}

function ensureInput(
  store: ReturnType<typeof createMemoryStore>,
  worker: ReturnType<typeof createWorker>,
  destinations: {
    ai_agents: string | null;
    virtual_phone: string | null;
    calendar: string | null;
    claim_your_ai: string | null;
  },
  ids?: { organizationId?: string; prospectId?: string },
) {
  return {
    organizationId: ids?.organizationId ?? "org-a",
    prospectId: ids?.prospectId ?? "prospect-1",
    destinations,
    store,
    worker: worker.worker,
  };
}

describe("Prospect Funnel canonical destinations", () => {
  it("builds the four HTTPS destinations and keeps Call your AI on tel", async () => {
    for (const language of ["fr", "de"] as const) {
      const calls: string[] = [];
      const context = await resolveProspectFunnelEnsureContext({
        organizationId: "org-a",
        prospectId: "prospect-1",
        loaders: {
          loadProspect: async (prospectId, organizationId) => {
            calls.push(`${organizationId}:${prospectId}`);
            return { id: prospectId, business_name: `  ${BUSINESS}  ` };
          },
          loadAuthor: async () => ({
            authorId: AUTHOR,
            licenseeDefaultLanguage: language,
          }),
          loadListingId: async (input) => {
            calls.push(`listing:${input.organizationId}:${input.prospectId}`);
            return LISTING;
          },
        },
      });
      assert.ok(context);
      assert.deepEqual(calls, [
        "org-a:prospect-1",
        "listing:org-a:prospect-1",
      ]);
      const portfolio = buildGetOblicFunnelPresentation({
        authorId: AUTHOR,
        contactId: LISTING,
        businessName: BUSINESS,
        licenseeDefaultLanguage: language,
      });
      assert.ok(portfolio);
      const expected = canonical(language);
      assert.equal(context.destinations.ai_agents, portfolio.aiAgentsHref);
      assert.equal(context.destinations.virtual_phone, portfolio.virtualPhoneHref);
      assert.equal(context.destinations.calendar, portfolio.calendarHref);
      assert.equal(context.destinations.claim_your_ai, expected.claim_your_ai);
      assert.equal(context.callHref, expected.call);
      assert.match(context.callHref ?? "", /^tel:\+/);
      for (const href of Object.values(context.destinations)) {
        assert.equal(typeof href, "string");
        const url = new URL(String(href));
        assert.equal(url.origin, "https://claim.getoblic.com");
        assert.equal(url.searchParams.get("author_id"), String(AUTHOR));
        assert.equal(url.searchParams.get("contact_id"), String(LISTING));
        assert.equal(url.searchParams.get("business_name"), BUSINESS);
        assert.match(String(href), /%26/);
        assert.match(String(href), /%3D/);
        assert.doesNotMatch(String(href), /^tel:/);
      }
    }

    const destinationsSource = read(
      "services/prospects/prospectFunnelCanonicalDestinations.ts",
    );
    assert.match(destinationsSource, /contactId: listingId/);
    assert.match(
      destinationsSource,
      /readAuthorizedGetOblicFunnelListingId\(/,
    );
    assert.doesNotMatch(
      destinationsSource,
      /readLinkedGetOblicFunnelContactId|loadActiveLink/,
    );

    const french = canonical("fr");
    const german = canonical("de");
    assert.equal(
      new URL(french.ai_agents).pathname,
      "/business-portfolio-agent-ia",
    );
    assert.equal(
      new URL(french.virtual_phone).pathname,
      "/business-portfolio-ligne-virtuelle",
    );
    assert.equal(
      new URL(french.calendar).pathname,
      "/business-portfolio-calendrier-ia",
    );
    assert.equal(
      new URL(String(french.claim_your_ai)).pathname,
      "/business-demo-compte-ia-page",
    );
    assert.equal(french.call, "tel:+33162045206,946970#");
    assert.equal(
      new URL(german.ai_agents).pathname,
      "/business-portfolio-ai-agent-page",
    );
    assert.equal(
      new URL(german.virtual_phone).pathname,
      "/business-portfolio-virtual-line-page",
    );
    assert.equal(
      new URL(german.calendar).pathname,
      "/business-portfolio-booking-page",
    );
    assert.equal(
      new URL(String(german.claim_your_ai)).pathname,
      "/business-created-page",
    );
    assert.equal(german.call, "tel:+18666658001,946970#");
  });

  it("omits portfolio, claim, and call destinations when listing authorization is denied", async () => {
    const context = await resolveProspectFunnelEnsureContext({
      organizationId: "org-a",
      prospectId: "prospect-1",
      loaders: {
        loadProspect: async (prospectId, organizationId) => {
          assert.equal(organizationId, "org-a");
          return { id: prospectId, business_name: BUSINESS };
        },
        loadAuthor: async (organizationId) => {
          assert.equal(organizationId, "org-a");
          return { authorId: AUTHOR, licenseeDefaultLanguage: "fr" };
        },
        loadListingId: async (input) => {
          assert.equal(input.organizationId, "org-a");
          assert.equal(input.prospectId, "prospect-1");
          return null;
        },
      },
    });
    assert.ok(context);
    assert.equal(context.organizationId, "org-a");
    assert.equal(context.prospectId, "prospect-1");
    assert.equal(context.destinations.ai_agents, null);
    assert.equal(context.destinations.virtual_phone, null);
    assert.equal(context.destinations.calendar, null);
    assert.equal(context.destinations.claim_your_ai, null);
    assert.equal(context.callHref, null);
  });

  it("returns not found for another organization and does not shorten tel links", async () => {
    const missing = await resolveProspectFunnelEnsureContext({
      organizationId: "org-b",
      prospectId: "prospect-1",
      loaders: {
        loadProspect: async (_prospectId, organizationId) =>
          organizationId === "org-a"
            ? { id: "prospect-1", business_name: BUSINESS }
            : null,
      },
    });
    assert.equal(missing, null);

    const store = createMemoryStore();
    const worker = createWorker();
    const links = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: {
        ...emptyDestinations(),
        ai_agents: "tel:+33162045206,946970#",
        virtual_phone: "tel:+18666658001,946970#",
        calendar: canonical("fr").call,
        claim_your_ai: "tel:+33162045206,946970#",
      },
      store,
      worker: worker.worker,
    });
    assert.equal(links.ai_agents, null);
    assert.equal(links.virtual_phone, null);
    assert.equal(links.calendar, null);
    assert.equal(links.claim_your_ai, null);
    assert.equal(worker.ops.length, 0);
    assert.equal(worker.attempted.length, 0);
    assert.equal(store.rows().length, 0);
    assert.equal("call_your_ai" in links, false);
  });
});

describe("Prospect Funnel short-link ensure", () => {
  it("creates one readable short link per authorized CTA and reuses it", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destinations = canonical("fr");
    const input = ensureInput(store, worker, {
      ai_agents: destinations.ai_agents,
      virtual_phone: destinations.virtual_phone,
      calendar: destinations.calendar,
      claim_your_ai: destinations.claim_your_ai,
    });
    const first = await ensureProspectFunnelShortLinks(input);
    const second = await ensureProspectFunnelShortLinks(input);

    assert.deepEqual(first, {
      ai_agents: short(AI),
      virtual_phone: short(PHONE),
      calendar: short(CAL),
      claim_your_ai: short(CLAIM),
    });
    assert.deepEqual(second, first);
    assert.deepEqual(
      worker.ops.filter((op) => op.op === "create").map((op) => op.slug),
      [AI, PHONE, CAL, CLAIM],
    );
    assert.equal(worker.attempted.some((slug) => slug.startsWith("pf_")), false);
    for (const slug of worker.attempted) {
      assert.match(slug, GETOBLIC_SLUG_PATTERN);
      assert.match(slug, /^[a-z0-9-]+$/);
    }
    assert.equal(store.rows().length, 4);
    const stored = store.rows().find((row) => row.ctaKey === "ai_agents");
    assert.equal(stored?.destinationUrl, destinations.ai_agents);
    assert.equal(stored?.lifecycle, "active");
    assert.equal(stored?.slug, AI);
    assert.equal(stored?.organizationId, "org-a");
    assert.equal(stored?.prospectId, "prospect-1");
    assert.equal(
      new URL(String(stored?.destinationUrl)).searchParams.get("contact_id"),
      String(CONTACT),
    );
    const claim = store.rows().find((row) => row.ctaKey === "claim_your_ai");
    assert.equal(
      new URL(String(claim?.destinationUrl)).searchParams.get("contact_id"),
      String(LISTING),
    );
  });

  it("does not create a second Worker link for concurrent ensure calls", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const input = ensureInput(store, worker, {
      ...emptyDestinations(),
      ai_agents: canonical("de").ai_agents,
    });
    const [left, right] = await Promise.all([
      ensureProspectFunnelShortLinks(input),
      ensureProspectFunnelShortLinks(input),
    ]);
    assert.equal(left.ai_agents, short(AI));
    assert.equal(right.ai_agents, short(AI));
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(store.rows().filter((row) => row.ctaKey === "ai_agents").length, 1);
  });

  it("retires the previous Worker link before exposing the next readable version", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const french = canonical("fr");
    const german = canonical("de");
    const first = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: french.ai_agents }),
    );
    assert.equal(first.ai_agents, short(AI));
    worker.workerState.failDisables = 1;
    const blocked = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: german.ai_agents }),
    );
    assert.equal(blocked.ai_agents, null);
    assert.equal(worker.links.get(AI)?.disabled, false);
    assert.equal(worker.links.get(`${AI}-2`)?.url, german.ai_agents);
    assert.equal(
      store.rows().find((row) => row.ctaKey === "ai_agents")?.lifecycle,
      "replacing",
    );

    const replaced = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: german.ai_agents }),
    );
    assert.equal(replaced.ai_agents, short(`${AI}-2`));
    assert.notEqual(replaced.ai_agents, first.ai_agents);
    assert.equal(worker.links.get(AI)?.disabled, true);
    assert.equal(worker.links.get(`${AI}-2`)?.disabled, false);
    assert.equal(worker.links.get(`${AI}-2`)?.url, german.ai_agents);
    const createAt = worker.ops.findIndex((op) => op.op === "create" && op.slug === `${AI}-2`);
    const disableAt = worker.ops.findIndex((op) => op.op === "disable" && op.slug === AI);
    assert.ok(createAt >= 0);
    assert.ok(disableAt > createAt);
    const row = store.rows().find((entry) => entry.ctaKey === "ai_agents");
    assert.equal(row?.lifecycle, "active");
    assert.equal(row?.slug, `${AI}-2`);
    assert.equal(row?.destinationUrl, german.ai_agents);
    assert.equal(row?.replacementSlug, null);

    const next = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: french.ai_agents }),
    );
    assert.equal(next.ai_agents, short(`${AI}-3`));
    assert.equal(worker.links.get(`${AI}-2`)?.disabled, true);
    assert.equal(worker.attempted.includes(`${AI}-10`), false);
  });

  it("replaces an active legacy slug with the preferred readable slug", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("de").ai_agents;
    const legacy = "pf_legacy_token";
    store.seed(
      activeSeed({
        prospectId: "prospect-1",
        destinationUrl: destination,
        slug: legacy,
        generation: 4,
      }),
    );
    worker.links.set(legacy, { url: destination, disabled: false });

    const links = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: destination }),
    );
    assert.equal(links.ai_agents, short(AI));
    assert.equal(worker.links.get(legacy)?.disabled, true);
    assert.equal(worker.links.get(AI)?.url, destination);
    const createAt = worker.ops.findIndex((op) => op.op === "create" && op.slug === AI);
    const disableAt = worker.ops.findIndex((op) => op.op === "disable" && op.slug === legacy);
    assert.ok(createAt >= 0);
    assert.ok(disableAt > createAt);
    const row = store.rows().find((entry) => entry.ctaKey === "ai_agents");
    assert.equal(row?.lifecycle, "active");
    assert.equal(row?.slug, AI);
    assert.equal(row?.destinationUrl, destination);
  });

  it("uses the new listing id when contact_id changes and retires the old link", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const firstHref = buildGetOblicFunnelPresentation({
      authorId: AUTHOR,
      contactId: CONTACT,
      businessName: BUSINESS,
      licenseeDefaultLanguage: "de",
    })?.aiAgentsHref;
    const secondHref = buildGetOblicFunnelPresentation({
      authorId: AUTHOR,
      contactId: CONTACT + 1,
      businessName: BUSINESS,
      licenseeDefaultLanguage: "de",
    })?.aiAgentsHref;
    assert.ok(firstHref);
    assert.ok(secondHref);
    const first = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: firstHref }),
    );
    const second = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: secondHref }),
    );
    assert.equal(first.ai_agents, short(AI));
    assert.equal(second.ai_agents, short(`ai-agents-${CONTACT + 1}`));
    assert.notEqual(second.ai_agents, short(`${AI}-2`));
    assert.equal(worker.links.get(AI)?.disabled, true);
    assert.equal(worker.links.get(`ai-agents-${CONTACT + 1}`)?.url, secondHref);
    const createAt = worker.ops.findIndex(
      (op) => op.op === "create" && op.slug === `ai-agents-${CONTACT + 1}`,
    );
    const disableAt = worker.ops.findIndex((op) => op.op === "disable" && op.slug === AI);
    assert.ok(disableAt > createAt);
  });

  it("keeps Claim your AI as the only shortened CTA when the others are absent", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("fr").claim_your_ai;
    assert.ok(destination);
    const links = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), claim_your_ai: destination }),
    );
    assert.equal(links.claim_your_ai, short(CLAIM));
    assert.equal(links.ai_agents, null);
    assert.equal(links.virtual_phone, null);
    assert.equal(links.calendar, null);
    assert.deepEqual(
      store.rows().map((row) => row.ctaKey),
      ["claim_your_ai"],
    );
    assert.equal(store.rows()[0]?.slug, CLAIM);
    assert.equal(
      new URL(String(store.rows()[0]?.destinationUrl)).searchParams.get("contact_id"),
      String(LISTING),
    );
    assert.equal(worker.attempted.length, 1);
  });

  it("disables an existing Worker link when the CTA is no longer authorized", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("fr").claim_your_ai;
    assert.ok(destination);
    await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), claim_your_ai: destination }),
    );
    const revoked = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, emptyDestinations()),
    );
    const repeated = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, emptyDestinations()),
    );
    assert.equal(revoked.claim_your_ai, null);
    assert.equal(repeated.claim_your_ai, null);
    assert.equal(worker.links.get(CLAIM)?.disabled, true);
    assert.equal(
      store.rows().find((row) => row.ctaKey === "claim_your_ai")?.lifecycle,
      "disabled",
    );
    assert.equal(worker.ops.filter((op) => op.op === "disable").length, 1);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);

    const restored = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), claim_your_ai: destination }),
    );
    assert.equal(restored.claim_your_ai, short(CLAIM));
    assert.equal(worker.links.get(CLAIM)?.disabled, false);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(worker.ops.filter((op) => op.op === "enable").length, 1);
  });

  it("keeps the long-URL fallback when the Worker times out or the key is missing", async () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const store = createMemoryStore();
      const worker = createWorker();
      const destination = canonical("de").calendar;
      worker.workerState.createError = new ProspectFunnelWorkerError(
        "CONFIG_MISSING",
        "GetOblic Links is not configured.",
      );
      const missingKey = await ensureProspectFunnelShortLinks(
        ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
      );
      assert.equal(missingKey.calendar, null);
      assert.equal(worker.ops.filter((op) => op.op === "create").length, 0);

      worker.workerState.failCreates = 1;
      const timedOut = await ensureProspectFunnelShortLinks(
        ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
      );
      assert.equal(timedOut.calendar, null);
      const recovered = await ensureProspectFunnelShortLinks(
        ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
      );
      assert.equal(recovered.calendar, short(CAL));
      assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
      const logged = JSON.stringify(errors);
      assert.match(logged, /CONFIG_MISSING/);
      assert.match(logged, /TIMEOUT/);
      assert.doesNotMatch(logged, /claim\.getoblic\.com/);
      assert.doesNotMatch(logged, /North & West/);
      assert.doesNotMatch(logged, /API_KEY|apiKey|secret/i);
    } finally {
      console.error = original;
    }
  });

  it("retries a timed-out create without a second Worker link", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("fr").virtual_phone;
    worker.workerState.acceptThenTimeout = true;
    const first = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), virtual_phone: destination }),
    );
    assert.equal(first.virtual_phone, null);
    const second = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), virtual_phone: destination }),
    );
    assert.equal(second.virtual_phone, short(PHONE));
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(worker.links.size, 1);
    assert.equal(store.rows().find((row) => row.ctaKey === "virtual_phone")?.slug, PHONE);
  });

  it("retries after a failed promotion without creating another slug", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("de").ai_agents;
    store.failNextActivePromotes = 1;
    const first = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: destination }),
    );
    assert.equal(first.ai_agents, null);
    assert.equal(store.rows().find((row) => row.ctaKey === "ai_agents")?.lifecycle, "pending");
    const second = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: destination }),
    );
    assert.equal(second.ai_agents, short(AI));
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(worker.links.size, 1);
    assert.equal(store.rows().find((row) => row.ctaKey === "ai_agents")?.slug, AI);
  });

  it("does not adopt, disable, enable, or retarget a foreign slug", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("de").calendar;
    const other =
      "https://claim.getoblic.com/business-created-page?author_id=1&contact_id=2&business_name=Other";
    worker.links.set(CAL, { url: other, disabled: false });
    const links = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
    );
    assert.equal(links.calendar, short(`${CAL}-2`));
    assert.equal(worker.links.get(CAL)?.disabled, false);
    assert.equal(worker.links.get(CAL)?.url, other);
    assert.equal(worker.links.get(`${CAL}-2`)?.url, destination);
    assert.equal(worker.ops.some((op) => op.op === "disable"), false);
    assert.equal(worker.ops.some((op) => op.op === "enable"), false);
    assert.equal(worker.attempted.includes(`${CAL}-10`), false);
  });

  it("adopts a Worker 409 only when the slug and destination both match", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("de").calendar;
    worker.links.set(CAL, { url: destination, disabled: false });
    const links = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
    );
    assert.equal(links.calendar, short(CAL));
    assert.equal(worker.links.size, 1);
    assert.equal(worker.links.get(CAL)?.url, destination);
    assert.equal(worker.links.get(CAL)?.disabled, false);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 0);
    assert.equal(worker.ops.some((op) => op.op === "disable" || op.op === "enable"), false);
  });

  it("does not enable a disabled foreign link that uses the preferred slug", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("de").calendar;
    worker.links.set(CAL, { url: destination, disabled: true });
    const links = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
    );
    assert.equal(links.calendar, short(`${CAL}-2`));
    assert.equal(worker.links.get(CAL)?.disabled, true);
    assert.equal(worker.ops.some((op) => op.op === "enable"), false);
    assert.equal(worker.ops.some((op) => op.op === "disable" && op.slug === CAL), false);
  });

  it("rereads a mapping conflict and advances a slug conflict", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("fr").ai_agents;
    store.mappingConflicts = 1;
    const reread = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: destination }),
    );
    assert.equal(reread.ai_agents, short(AI));
    assert.equal(store.rows().length, 1);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);

    store.seed(
      activeSeed({
        organizationId: "org-b",
        prospectId: "prospect-9",
        destinationUrl: destination,
        slug: AI,
      }),
    );
    const advanced = await ensureProspectFunnelShortLinks(
      ensureInput(
        store,
        worker,
        { ...emptyDestinations(), ai_agents: destination },
        { organizationId: "org-c", prospectId: "prospect-3" },
      ),
    );
    assert.equal(advanced.ai_agents, short(`${AI}-2`));
    assert.equal(
      store.rows().find((row) => row.organizationId === "org-b")?.slug,
      AI,
    );
    assert.equal(worker.links.get(AI)?.disabled ?? false, false);
    assert.equal(worker.attempted.includes(AI), true);
    assert.equal(
      worker.attempted.filter((slug) => slug === AI).length,
      1,
    );
  });

  it("returns the long URL when readable versions are exhausted", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("de").calendar;
    const other =
      "https://claim.getoblic.com/business-created-page?author_id=1&contact_id=2&business_name=Other";
    for (const slug of versioned(CAL)) {
      worker.links.set(slug, { url: other, disabled: false });
    }
    const links = await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), calendar: destination }),
    );
    assert.equal(links.calendar, null);
    assert.deepEqual(worker.attempted, versioned(CAL));
    assert.equal(worker.attempted.includes(`${CAL}-10`), false);
    assert.equal(worker.ops.some((op) => op.op === "create"), false);
    assert.equal(worker.ops.some((op) => op.op === "disable" || op.op === "enable"), false);
    for (const slug of versioned(CAL)) {
      assert.equal(worker.links.get(slug)?.disabled, false);
      assert.equal(worker.links.get(slug)?.url, other);
    }

    const dbStore = createMemoryStore();
    const dbWorker = createWorker();
    versioned(CAL).forEach((slug, index) => {
      dbStore.seed(
        activeSeed({
          prospectId: `prospect-held-${index}`,
          ctaKey: "calendar",
          destinationUrl: other,
          slug,
        }),
      );
    });
    const blocked = await ensureProspectFunnelShortLinks(
      ensureInput(dbStore, dbWorker, { ...emptyDestinations(), calendar: destination }),
    );
    assert.equal(blocked.calendar, null);
    assert.equal(dbWorker.attempted.length, 0);
    assert.equal(
      dbStore.rows().some((row) => row.prospectId === "prospect-1"),
      false,
    );
  });

  it("classifies identity conflicts apart from slug and replacement conflicts", () => {
    assert.equal(
      classifyProspectFunnelUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "athena_prospect_funnel_short_links_identity_key"',
        details:
          "Key (organization_id, prospect_id, cta_key)=(a, b, ai_agents) already exists.",
      }),
      "mapping",
    );
    assert.equal(
      classifyProspectFunnelUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "athena_prospect_funnel_short_links_slug_key"',
        details: "Key (slug)=(ai-agents-9001) already exists.",
      }),
      "slug",
    );
    assert.equal(
      classifyProspectFunnelUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "athena_prospect_funnel_short_links_replacement_slug_uidx"',
        details: "Key (replacement_slug)=(ai-agents-9001-2) already exists.",
      }),
      "slug",
    );
    assert.equal(
      classifyProspectFunnelUniqueViolation({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      }),
      null,
    );
    assert.equal(classifyProspectFunnelUniqueViolation(null), null);
  });

  it("isolates mappings by organization and Prospect", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const destination = canonical("fr").ai_agents;
    await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, { ...emptyDestinations(), ai_agents: destination }),
    );
    await ensureProspectFunnelShortLinks(
      ensureInput(
        store,
        worker,
        { ...emptyDestinations(), ai_agents: destination },
        { organizationId: "org-b", prospectId: "prospect-1" },
      ),
    );
    await ensureProspectFunnelShortLinks(
      ensureInput(
        store,
        worker,
        { ...emptyDestinations(), ai_agents: destination },
        { organizationId: "org-a", prospectId: "prospect-2" },
      ),
    );
    const rows = store.rows().filter((row) => row.ctaKey === "ai_agents");
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((row) => `${row.organizationId}:${row.prospectId}:${row.slug}`).sort(),
      [
        `org-a:prospect-1:${AI}`,
        `org-a:prospect-2:${AI}-3`,
        `org-b:prospect-1:${AI}-2`,
      ],
    );
    const orgA = rows.find(
      (row) => row.organizationId === "org-a" && row.prospectId === "prospect-1",
    );
    await ensureProspectFunnelShortLinks(
      ensureInput(store, worker, emptyDestinations(), {
        organizationId: "org-b",
        prospectId: "prospect-2",
      }),
    );
    const orgAAfter = store
      .rows()
      .find((row) => row.organizationId === "org-a" && row.prospectId === "prospect-1");
    assert.equal(orgAAfter?.slug, orgA?.slug);
    assert.equal(orgAAfter?.lifecycle, "active");
    assert.equal(worker.links.get(orgA?.slug ?? "")?.disabled, false);
  });
});

describe("Prospect Funnel short-link boundaries", () => {
  it("keeps server render, manual links, and browser history outside link creation", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const route = read("app/api/prospects/[id]/funnel-links/route.ts");
    const client = read("components/prospects/ProspectFunnelShortLinks.tsx");
    const worker = read("services/prospects/prospectFunnelShortLinkWorker.ts");
    const persistence = read(
      "services/prospects/prospectFunnelShortLinkPersistence.ts",
    );
    const migration = read(
      "supabase/migrations/20261013000002_create_athena_prospect_funnel_short_links.sql",
    );

    assert.match(page, /buildGetOblicFunnelPresentation\(\{/);
    assert.match(page, /buildGetOblicFunnelCallHref\(\{/);
    assert.match(page, /buildGetOblicFunnelClaimHref\(\{/);
    assert.match(page, /ProspectFunnelShortLinks/);
    assert.match(page, /prospectId=\{prospect\.id\}/);
    assert.doesNotMatch(
      page,
      /createGetOblicLink|updateGetOblicLink|deleteGetOblicLink|ensureProspectFunnelShortLinks|localStorage/,
    );
    assert.doesNotMatch(page, /@\/lib\/getoblic-links\/server/);

    assert.match(route, /_request/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /destinations: resolved\.destinations/);
    assert.doesNotMatch(route, /request\.json|callHref|deleteGetOblicLink/);
    assert.doesNotMatch(route, /author_id|business_name|destination_url/);

    assert.doesNotMatch(
      client,
      /localStorage|writeGetOblicLinksHistory|pushState|createGetOblicLink/,
    );
    assert.match(client, /useEffect/);
    assert.match(client, /\/funnel-links/);

    assert.match(worker, /disabled:\s*true/);
    assert.match(worker, /updateGetOblicLink/);
    assert.doesNotMatch(worker, /deleteGetOblicLink/);

    assert.equal(persistence.match(/\.eq\("organization_id"/g)?.length, 3);
    assert.equal(persistence.match(/\.eq\("prospect_id"/g)?.length, 3);
    assert.match(persistence, /organization_id: key\.organizationId/);
    assert.match(persistence, /prospect_id: key\.prospectId/);

    assert.match(
      migration,
      /unique \(organization_id, prospect_id, cta_key\)/,
    );
    assert.match(migration, /'ai_agents'/);
    assert.match(migration, /'virtual_phone'/);
    assert.match(migration, /'calendar'/);
    assert.match(migration, /'claim_your_ai'/);
    assert.doesNotMatch(migration, /call_your_ai/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on table athena_prospect_funnel_short_links from authenticated/);
    assert.match(migration, /grant all on table athena_prospect_funnel_short_links to service_role/);
    assert.match(migration, /PATCH disabled=true/);
    assert.doesNotMatch(
      read("services/prospects/prospectFunnelShortLinkPersistence.ts"),
      /20261013000002/,
    );
    assert.doesNotMatch(
      read("services/prospects/prospectFunnelShortLinks.ts"),
      /randomBytes|writeGetOblicLinksHistory|localStorage|createGetOblicLink|pushState/,
    );
    assert.doesNotMatch(
      read("services/prospects/prospectFunnelShortLinkPersistence.ts"),
      /writeGetOblicLinksHistory|localStorage|createGetOblicLink|pushState/,
    );

    for (const file of [
      "lib/getoblic-links/history.ts",
      "lib/getoblic-links/server.ts",
      "lib/licensee/licenseeUsefulLinksPresentation.ts",
      "components/licensee/LicenseeUsefulLinksPanel.tsx",
      "app/api/getoblic-links/route.ts",
      "app/api/getoblic-links/[slug]/route.ts",
      "app/api/licensee/getoblic-links/route.ts",
      "app/api/licensee/getoblic-links/[slug]/route.ts",
      "lib/prospects/getOblicFunnelPresentation.ts",
    ]) {
      assert.doesNotMatch(read(file), /prospectFunnelShortLink|funnel-links/, file);
    }
  });

  it("disables through PATCH and does not treat DELETE or a 404 as a live link", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GETOBLIC_LINKS_API_KEY;
    const originalBase = process.env.GETOBLIC_LINKS_BASE_URL;
    process.env.GETOBLIC_LINKS_API_KEY = "test-secret-key";
    process.env.GETOBLIC_LINKS_BASE_URL = "https://link.getoblic.com";
    const calls: Array<{ url: string; method: string; body: string }> = [];
    globalThis.fetch = (async (input, init) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : "";
      calls.push({ url: String(input), method, body });
      if (method === "PATCH" && String(input).endsWith("/missing")) {
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      }
      if (method === "DELETE") {
        throw new Error("DELETE must not be used to retire a funnel link");
      }
      return new Response(
        JSON.stringify({
          success: true,
          slug: "pf_adapter",
          short_url: "https://workers.example.dev/pf_adapter",
          destination_url: "https://claim.getoblic.com/business-created-page?author_id=1&contact_id=2&business_name=Acme",
          disabled: true,
          link: {
            slug: "pf_adapter",
            url: "https://claim.getoblic.com/business-created-page?author_id=1&contact_id=2&business_name=Acme",
            short_url: "https://workers.example.dev/pf_adapter",
            disabled: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const worker = createProspectFunnelShortLinkWorker();
      await worker.disable("pf_adapter");
      await worker.disable("missing");
      assert.equal(calls.length, 2);
      assert.equal(calls[0]?.method, "PATCH");
      assert.match(calls[0]?.body ?? "", /"disabled":true/);
      assert.doesNotMatch(calls[0]?.body ?? "", /"enabled"/);
      assert.equal(calls[1]?.method, "PATCH");
      assert.equal(
        calls.some((call) => call.method === "DELETE"),
        false,
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GETOBLIC_LINKS_API_KEY;
      else process.env.GETOBLIC_LINKS_API_KEY = originalKey;
      if (originalBase === undefined) delete process.env.GETOBLIC_LINKS_BASE_URL;
      else process.env.GETOBLIC_LINKS_BASE_URL = originalBase;
    }
  });
});
