/**
 * FUNNEL-LINKS-1 — Prospect Funnel short links.
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
import {
  createProspectFunnelSlug,
  ensureProspectFunnelShortLinks,
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
} {
  const rows = new Map<string, ProspectFunnelShortLinkRow>();
  const store = {
    failNextActivePromotes: 0,
    rows() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async get(key: ProspectFunnelShortLinkKey) {
      await Promise.resolve();
      const row = rows.get(storageKey(key));
      return row ? { ...row } : null;
    },
    async insert(key: ProspectFunnelShortLinkKey, state: ProspectFunnelShortLinkState) {
      if (rows.has(storageKey(key))) return { status: "conflict" as const };
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

function createWorker() {
  const links = new Map<string, { url: string; disabled: boolean }>();
  const ops: Array<{ op: "create" | "get" | "disable" | "enable"; slug: string }> = [];
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
      shortUrl: `https://link.getoblic.com/${slug}`,
      disabled: link.disabled,
    };
  }

  return {
    links,
    ops,
    workerState,
    worker: {
      async create(input: { url: string; slug: string }) {
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

function createSlugs() {
  const issued: string[] = [];
  return {
    issued,
    createSlug() {
      const slug = `pf_test_${String(issued.length + 1).padStart(4, "0")}`;
      issued.push(slug);
      return slug;
    },
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
          loadActiveLink: async (organizationId, prospectId) => {
            calls.push(`link:${organizationId}:${prospectId}`);
            return {
              relationship_status: "linked",
              wordpress_listing_id: CONTACT,
            };
          },
          loadListingId: async (input) => {
            calls.push(`listing:${input.organizationId}:${input.prospectId}`);
            return LISTING;
          },
        },
      });
      assert.ok(context);
      assert.deepEqual(calls, [
        "org-a:prospect-1",
        "link:org-a:prospect-1",
        "listing:org-a:prospect-1",
      ]);
      const expected = canonical(language);
      assert.equal(context.destinations.ai_agents, expected.ai_agents);
      assert.equal(context.destinations.virtual_phone, expected.virtual_phone);
      assert.equal(context.destinations.calendar, expected.calendar);
      assert.equal(context.destinations.claim_your_ai, expected.claim_your_ai);
      assert.equal(context.callHref, expected.call);
      assert.match(context.callHref ?? "", /^tel:\+/);
      for (const href of Object.values(context.destinations)) {
        assert.equal(typeof href, "string");
        const url = new URL(String(href));
        assert.equal(url.origin, "https://claim.getoblic.com");
        assert.equal(url.searchParams.get("author_id"), String(AUTHOR));
        assert.equal(url.searchParams.get("business_name"), BUSINESS);
        assert.match(String(href), /%26/);
        assert.match(String(href), /%3D/);
        assert.doesNotMatch(String(href), /^tel:/);
      }
      assert.equal(
        new URL(String(context.destinations.ai_agents)).searchParams.get("contact_id"),
        String(CONTACT),
      );
      assert.equal(
        new URL(String(context.destinations.claim_your_ai)).searchParams.get(
          "contact_id",
        ),
        String(LISTING),
      );
      assert.notEqual(
        new URL(String(context.destinations.ai_agents)).searchParams.get("contact_id"),
        String(LISTING),
      );
    }

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
    const slugs = createSlugs();
    const links = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: {
        ...emptyDestinations(),
        ai_agents: "tel:+33162045206,946970#",
      },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(links.ai_agents, null);
    assert.equal(worker.ops.length, 0);
    assert.equal(store.rows().length, 0);
  });
});

describe("Prospect Funnel short-link ensure", () => {
  it("creates one short link per authorized CTA and reuses it on refresh", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const slugs = createSlugs();
    const destinations = canonical("fr");
    const input = {
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: {
        ai_agents: destinations.ai_agents,
        virtual_phone: destinations.virtual_phone,
        calendar: destinations.calendar,
        claim_your_ai: destinations.claim_your_ai,
      },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    };
    const first = await ensureProspectFunnelShortLinks(input);
    const creates = worker.ops.filter((op) => op.op === "create");
    const second = await ensureProspectFunnelShortLinks(input);

    assert.equal(creates.length, 4);
    assert.deepEqual(second, first);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 4);
    assert.equal(store.rows().length, 4);
    for (const href of Object.values(first)) {
      assert.match(href ?? "", /^https:\/\/link\.getoblic\.com\/pf_test_/);
    }
    const stored = store.rows().find((row) => row.ctaKey === "ai_agents");
    assert.equal(stored?.destinationUrl, destinations.ai_agents);
    assert.equal(stored?.lifecycle, "active");
    assert.equal(stored?.organizationId, "org-a");
    assert.equal(stored?.prospectId, "prospect-1");
  });

  it("does not create a second Worker link for concurrent ensure calls", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const slugs = createSlugs();
    const destinations = {
      ...emptyDestinations(),
      ai_agents: canonical("de").ai_agents,
    };
    const input = {
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations,
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    };
    const [left, right] = await Promise.all([
      ensureProspectFunnelShortLinks(input),
      ensureProspectFunnelShortLinks(input),
    ]);
    assert.equal(left.ai_agents, right.ai_agents);
    assert.match(left.ai_agents ?? "", /^https:\/\/link\.getoblic\.com\/pf_test_/);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(
      store.rows().filter((row) => row.ctaKey === "ai_agents").length,
      1,
    );
  });

  it("retires the previous Worker link before exposing a replacement slug", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const slugs = createSlugs();
    const french = canonical("fr");
    const german = canonical("de");
    const first = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: french.ai_agents },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    const oldSlug = slugs.issued[0];
    assert.ok(oldSlug);
    worker.workerState.failDisables = 1;
    const blocked = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: german.ai_agents },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(blocked.ai_agents, null);
    assert.equal(worker.links.get(oldSlug)?.disabled, false);
    assert.equal(
      store.rows().find((row) => row.ctaKey === "ai_agents")?.lifecycle,
      "replacing",
    );

    const replaced = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: german.ai_agents },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    const replacementSlug = slugs.issued[1];
    assert.ok(replacementSlug);
    assert.equal(replaced.ai_agents, `https://link.getoblic.com/${replacementSlug}`);
    assert.notEqual(replaced.ai_agents, first.ai_agents);
    assert.equal(worker.links.get(oldSlug)?.disabled, true);
    assert.equal(worker.links.get(replacementSlug)?.disabled, false);
    assert.equal(worker.links.get(replacementSlug)?.url, german.ai_agents);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 2);
    const disableAt = worker.ops.findIndex(
      (op) => op.op === "disable" && op.slug === oldSlug && worker.links.get(oldSlug)?.disabled,
    );
    assert.ok(disableAt >= 0);
    const row = store.rows().find((entry) => entry.ctaKey === "ai_agents");
    assert.equal(row?.lifecycle, "active");
    assert.equal(row?.slug, replacementSlug);
    assert.equal(row?.destinationUrl, german.ai_agents);
    assert.equal(row?.replacementSlug, null);
  });

  it("disables an existing Worker link when the CTA is no longer authorized", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const slugs = createSlugs();
    const destination = canonical("fr").claim_your_ai;
    assert.ok(destination);
    await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), claim_your_ai: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    const slug = slugs.issued[0];
    assert.ok(slug);
    const revoked = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: emptyDestinations(),
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    const repeated = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: emptyDestinations(),
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(revoked.claim_your_ai, null);
    assert.equal(repeated.claim_your_ai, null);
    assert.equal(worker.links.get(slug)?.disabled, true);
    assert.equal(
      store.rows().find((row) => row.ctaKey === "claim_your_ai")?.lifecycle,
      "disabled",
    );
    assert.equal(worker.ops.filter((op) => op.op === "disable").length, 1);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
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
      const slugs = createSlugs();
      const destination = canonical("de").calendar;
      worker.workerState.createError = new ProspectFunnelWorkerError(
        "CONFIG_MISSING",
        "GetOblic Links is not configured.",
      );
      const missingKey = await ensureProspectFunnelShortLinks({
        organizationId: "org-a",
        prospectId: "prospect-1",
        destinations: { ...emptyDestinations(), calendar: destination },
        store,
        worker: worker.worker,
        createSlug: slugs.createSlug,
      });
      assert.equal(missingKey.calendar, null);
      assert.equal(worker.ops.filter((op) => op.op === "create").length, 0);

      worker.workerState.failCreates = 1;
      const timedOut = await ensureProspectFunnelShortLinks({
        organizationId: "org-a",
        prospectId: "prospect-1",
        destinations: { ...emptyDestinations(), calendar: destination },
        store,
        worker: worker.worker,
        createSlug: slugs.createSlug,
      });
      assert.equal(timedOut.calendar, null);
      const recovered = await ensureProspectFunnelShortLinks({
        organizationId: "org-a",
        prospectId: "prospect-1",
        destinations: { ...emptyDestinations(), calendar: destination },
        store,
        worker: worker.worker,
        createSlug: slugs.createSlug,
      });
      assert.match(recovered.calendar ?? "", /^https:\/\/link\.getoblic\.com\/pf_test_/);
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
    const slugs = createSlugs();
    const destination = canonical("fr").virtual_phone;
    worker.workerState.acceptThenTimeout = true;
    const first = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), virtual_phone: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(first.virtual_phone, null);
    const second = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), virtual_phone: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(
      second.virtual_phone,
      `https://link.getoblic.com/${slugs.issued[0]}`,
    );
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(worker.links.size, 1);
  });

  it("retries after a failed promotion without creating another slug", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const slugs = createSlugs();
    const destination = canonical("de").ai_agents;
    store.failNextActivePromotes = 1;
    const first = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(first.ai_agents, null);
    assert.equal(
      store.rows().find((row) => row.ctaKey === "ai_agents")?.lifecycle,
      "pending",
    );
    const second = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    assert.equal(second.ai_agents, `https://link.getoblic.com/${slugs.issued[0]}`);
    assert.equal(worker.ops.filter((op) => op.op === "create").length, 1);
    assert.equal(slugs.issued.length, 1);
  });

  it("picks a new slug when the reserved slug belongs to another destination", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    worker.links.set("pf_taken_slug", {
      url: "https://claim.getoblic.com/business-created-page?author_id=1&contact_id=2&business_name=Other",
      disabled: false,
    });
    const issued = ["pf_taken_slug", "pf_fresh_slug"];
    const destination = canonical("de").calendar;
    const links = await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), calendar: destination },
      store,
      worker: worker.worker,
      createSlug: () => issued.shift() ?? "pf_unused_slug",
    });
    assert.equal(links.calendar, "https://link.getoblic.com/pf_fresh_slug");
    assert.equal(worker.links.get("pf_taken_slug")?.disabled, false);
    assert.notEqual(worker.links.get("pf_taken_slug")?.url, destination);
    assert.equal(worker.links.get("pf_fresh_slug")?.url, destination);
  });

  it("isolates mappings by organization and Prospect", async () => {
    const store = createMemoryStore();
    const worker = createWorker();
    const slugs = createSlugs();
    const destination = canonical("fr").ai_agents;
    await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    await ensureProspectFunnelShortLinks({
      organizationId: "org-b",
      prospectId: "prospect-1",
      destinations: { ...emptyDestinations(), ai_agents: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    await ensureProspectFunnelShortLinks({
      organizationId: "org-a",
      prospectId: "prospect-2",
      destinations: { ...emptyDestinations(), ai_agents: destination },
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    const rows = store.rows().filter((row) => row.ctaKey === "ai_agents");
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((row) => `${row.organizationId}:${row.prospectId}`).sort(),
      ["org-a:prospect-1", "org-a:prospect-2", "org-b:prospect-1"],
    );
    const orgA = rows.find((row) => row.organizationId === "org-a" && row.prospectId === "prospect-1");
    await ensureProspectFunnelShortLinks({
      organizationId: "org-b",
      prospectId: "prospect-2",
      destinations: emptyDestinations(),
      store,
      worker: worker.worker,
      createSlug: slugs.createSlug,
    });
    const orgAAfter = store
      .rows()
      .find((row) => row.organizationId === "org-a" && row.prospectId === "prospect-1");
    assert.equal(orgAAfter?.slug, orgA?.slug);
    assert.equal(orgAAfter?.lifecycle, "active");
    assert.equal(worker.links.get(orgA?.slug ?? "")?.disabled, false);
  });

  it("issues non-guessable slugs that match the Worker pattern", () => {
    const slugs = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      const slug = createProspectFunnelSlug();
      assert.match(slug, GETOBLIC_SLUG_PATTERN);
      assert.match(slug, /^pf_[A-Za-z0-9_-]{20,}$/);
      slugs.add(slug);
    }
    assert.equal(slugs.size, 20);
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
