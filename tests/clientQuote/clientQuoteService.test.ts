/**
 * EST-QUOTE-1C.3 — Licensee quotation service and API contracts.
 * In-memory adapters only. No live database writes.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { freezeOrganizationBrand } from "../../services/clientQuote/clientQuoteBrand";
import {
  mapOrganizationToCustomerSnapshot,
  mapProspectToCustomerSnapshot,
} from "../../services/clientQuote/clientQuoteCustomer";
import type {
  ClientQuoteDeps,
  ClientQuoteEstimateRecord,
  ClientQuoteIssueWriteResult,
  ClientQuoteMaskWriteResult,
  ClientQuoteOrganizationRecord,
  ClientQuoteProspectRecord,
} from "../../services/clientQuote/clientQuoteDeps";
import { ClientQuoteOperationError } from "../../services/clientQuote/clientQuoteErrors";
import {
  isClientQuoteHttpFailure,
  parseCreateClientQuoteBody,
  parseUpdateClientQuoteBody,
} from "../../services/clientQuote/clientQuoteHttp";
import { mapOrganizationCommercialIdentityToDraftIssuerSnapshot } from "../../services/clientQuote/clientQuoteIssuerProfile";
import { maskAthenaClientQuote } from "../../services/clientQuote/clientQuoteLifecycle";
import {
  assertClientQuoteLogoRemovalPath,
  buildClientQuoteLogoObjectPath,
} from "../../services/clientQuote/clientQuoteLogo";
import {
  formatClientQuoteNumber,
  nextClientQuoteSequence,
} from "../../services/clientQuote/clientQuoteNumber";
import { toPublicClientQuote } from "../../services/clientQuote/clientQuotePublic";
import { loadIssuedClientQuoteSnapshotForPdf } from "../../services/clientQuote/pdf/clientQuotePdfAccess";
import {
  createClientQuoteDraftForMaster,
  getClientQuoteForMaster,
  issueClientQuoteForMaster,
  listClientQuotesForMaster,
  maskClientQuoteForMaster,
  reviseClientQuoteForMaster,
  updateClientQuoteDraftForMaster,
} from "../../services/clientQuote/clientQuoteService";
import type {
  AthenaClientQuote,
  ClientQuoteDraftV1,
  ClientQuoteIssuedLogoSnapshot,
} from "../../services/clientQuote/clientQuoteTypes";
import { CLIENT_QUOTE_ROUNDING_CONTRACT } from "../../services/clientQuote/clientQuoteMoney";

const ROOT = process.cwd();
const USER_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_B = "88888888-8888-4888-8888-888888888888";
const USER_NONE = "77777777-7777-4777-8777-777777777777";
const LICENSEE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LICENSEE_B = "99999999-9999-4999-8999-999999999999";
const ORG_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_OWN = "abababab-abab-4aba-8aba-abababababab";
const ORG_FOREIGN = "12121212-1212-4121-8121-121212121212";
const ESTIMATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROSPECT = "34343434-3434-4343-8343-343434343434";
const T0 = "2026-10-09T09:00:00.000Z";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function licenseeAccess(message: string): Error {
  const error = new Error(message);
  error.name = "LicenseeAccessError";
  return error;
}

function readyPackage(amount = 100, currencyCode = "USD") {
  return {
    schemaVersion: "estimate_v1",
    recommendedClientPrice: { amount, currencyCode },
    scopeInterpretation: "Rebuild the client portal and migrate the catalog.",
    pricingRationale: "Fixed delivery.",
    keyPriceDrivers: ["Catalog size"],
    suggestedClientPositioning: "Fixed scope.",
    risksAndAssumptions: ["Assets are available"],
    guidanceDisclaimer: "Guidance only.",
    prospect_generation_context_json: { composedText: "SECRET_CONTEXT" },
  };
}

function ownCompany(
  overrides: Partial<ClientQuoteOrganizationRecord> = {},
): ClientQuoteOrganizationRecord & { email?: string } {
  return {
    id: ORG_OWN,
    name: "Alpha Studio",
    legal_name: "Alpha Studio Ltd",
    business_email: "billing@alpha.example",
    email: "provisional-login@getoblic.com",
    decision_maker: "Ada Lovelace",
    job_title: "Managing Director",
    address: "1 High Street",
    city: "London",
    country: "United Kingdom",
    phone: "+44 20 0000 0000",
    registration_number: "12345678",
    tax_identifier: "GB123",
    tax_identifier_label: "VAT",
    brand_primary_color: "#112233",
    brand_secondary_color: "445566",
    brand_accent_color: "#778899",
    brand_background_color: "#aabbcc",
    brand_font: "georgia",
    brand_logo_storage_path: `${ORG_OWN}/identity/logo/live.png`,
    language: "en",
    ...overrides,
  };
}

function clientOrg(
  overrides: Partial<ClientQuoteOrganizationRecord> = {},
): ClientQuoteOrganizationRecord & { email?: string } {
  return {
    id: ORG_CLIENT,
    name: "Northwind",
    legal_name: "Northwind Traders Ltd",
    business_email: "ap@northwind.example",
    email: "owner-login@getoblic.com",
    decision_maker: "Pat Lee",
    job_title: "Buyer",
    address: "2 Dock Street",
    city: "Seattle",
    language: "fr",
    ...overrides,
  };
}

type Harness = {
  deps: ClientQuoteDeps;
  quotes: Map<string, AthenaClientQuote>;
  organizationReads: string[];
  websiteReads: string[];
  estimateReads: Array<{ id: string; licenseeAccountId: string }>;
  logoCopies: Array<{ sourceOrganizationId: string; sourcePath: string; quoteId: string }>;
  removedLogos: string[];
  issueWrites: number;
  maskWrites: number;
  setNow: (value: string) => void;
  failLogo: { on: boolean };
  failIssue: { on: boolean };
  extraNumbers: string[];
  staleNumberLists: { remaining: number };
};

function createHarness(): Harness {
  const quotes = new Map<string, AthenaClientQuote>();
  const organizations = new Map<string, ClientQuoteOrganizationRecord>([
    [ORG_OWN, ownCompany()],
    [ORG_CLIENT, clientOrg()],
  ]);
  const prospects = new Map<string, ClientQuoteProspectRecord>([
    [
      PROSPECT,
      {
        id: PROSPECT,
        organization_id: ORG_CLIENT,
        business_name: "Fabrikam",
        legal_name: "Fabrikam Inc",
        email: "buyer@fabrikam.example",
        decision_maker: "Sam",
        job_title: "Director",
        address: "9 Market",
        city: "Paris",
        tax_identifier: "FR123",
      },
    ],
  ]);
  const estimates = new Map<string, ClientQuoteEstimateRecord & {
    prospect_generation_context_json?: unknown;
  }>([
    [
      `${LICENSEE_A}:${ESTIMATE}`,
      {
        id: ESTIMATE,
        licensee_account_id: LICENSEE_A,
        organization_id: ORG_CLIENT,
        organization_name_snapshot: "Northwind",
        prospect_id: null,
        prospect_business_name_snapshot: null,
        status: "Ready",
        package_json: readyPackage(),
        prospect_generation_context_json: { composedText: "SECRET_CONTEXT" },
      },
    ],
  ]);
  const owned = new Map<string, Set<string>>([
    [USER_A, new Set([ORG_CLIENT, ORG_OWN])],
    [USER_B, new Set()],
  ]);
  const masters = new Map([
    [USER_A, { licenseeAccountId: LICENSEE_A, ownCompanyOrganizationId: ORG_OWN as string | null }],
    [USER_B, { licenseeAccountId: LICENSEE_B, ownCompanyOrganizationId: null as string | null }],
  ]);
  let now = T0;
  let idSequence = 1;
  const organizationReads: string[] = [];
  const websiteReads: string[] = [];
  const estimateReads: Array<{ id: string; licenseeAccountId: string }> = [];
  const logoCopies: Harness["logoCopies"] = [];
  const removedLogos: string[] = [];
  const failLogo = { on: false };
  const failIssue = { on: false };
  const extraNumbers: string[] = [];
  const staleNumberLists = { remaining: 0 };
  let issueWrites = 0;
  let maskWrites = 0;

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  const deps: ClientQuoteDeps = {
    async requireMaster(masterUserId) {
      const master = masters.get(masterUserId);
      if (!master) {
        throw licenseeAccess("Authenticated user is not a Business Licensee Master.");
      }
      return {
        licenseeAccountId: master.licenseeAccountId,
        masterUserId,
        defaultLanguage: "en",
        ownCompanyOrganizationId: master.ownCompanyOrganizationId,
      };
    },
    async assertOwnsOrganization(input) {
      const orgs = owned.get(input.masterUserId);
      if (!orgs?.has(input.organizationId)) {
        throw licenseeAccess("Master does not own this sub-account relationship.");
      }
      const master = masters.get(input.masterUserId);
      if (!master) throw licenseeAccess("Authenticated user is not a Business Licensee Master.");
      return { licenseeAccountId: master.licenseeAccountId };
    },
    async getEstimate(estimateId, licenseeAccountId) {
      estimateReads.push({ id: estimateId, licenseeAccountId });
      return clone(estimates.get(`${licenseeAccountId}:${estimateId}`) ?? null);
    },
    async getOrganization(organizationId) {
      organizationReads.push(organizationId);
      return clone(organizations.get(organizationId) ?? null);
    },
    async getProspect(prospectId, organizationId) {
      const prospect = prospects.get(prospectId);
      if (!prospect || prospect.organization_id !== organizationId) return null;
      return clone(prospect);
    },
    async getIdentityWebsite(organizationId) {
      websiteReads.push(organizationId);
      if (organizationId === ORG_OWN) return "https://alpha.example";
      return null;
    },
    async insertQuote(quote) {
      const saved = clone(quote);
      quotes.set(saved.id, saved);
      return clone(saved);
    },
    async updateDraftQuote(quote) {
      const current = quotes.get(quote.id);
      if (
        !current ||
        current.status !== "draft" ||
        current.licensee_account_id !== quote.licensee_account_id
      ) {
        return null;
      }
      const saved = clone(quote);
      quotes.set(saved.id, saved);
      return clone(saved);
    },
    async issueQuote(quote): Promise<ClientQuoteIssueWriteResult> {
      issueWrites += 1;
      if (failIssue.on) throw new Error("database unavailable");
      const current = quotes.get(quote.id);
      if (
        !current ||
        current.status !== "draft" ||
        current.licensee_account_id !== quote.licensee_account_id
      ) {
        return { ok: false, reason: "not_draft" };
      }
      const taken = [...quotes.values()].some(
        (row) =>
          row.id !== quote.id &&
          row.licensee_account_id === quote.licensee_account_id &&
          row.quote_number === quote.quote_number,
      );
      if (taken) return { ok: false, reason: "conflict" };
      const saved = clone(quote);
      quotes.set(saved.id, saved);
      return { ok: true, quote: clone(saved) };
    },
    async getQuote(id, licenseeAccountId) {
      const quote = quotes.get(id);
      if (!quote || quote.licensee_account_id !== licenseeAccountId) return null;
      return clone(quote);
    },
    async listQuotes(licenseeAccountId) {
      return [...quotes.values()]
        .filter(
          (quote) =>
            quote.licensee_account_id === licenseeAccountId && !quote.deleted_at,
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((quote) => clone(quote));
    },
    async maskQuote(id, licenseeAccountId, deletedAt): Promise<ClientQuoteMaskWriteResult | null> {
      const current = quotes.get(id);
      if (!current || current.licensee_account_id !== licenseeAccountId) return null;
      const decision = maskAthenaClientQuote(current, deletedAt);
      if (!decision.alreadyMasked) {
        maskWrites += 1;
        quotes.set(id, decision.quote);
      }
      return {
        quote: clone(decision.quote),
        alreadyMasked: decision.alreadyMasked,
      };
    },
    async listQuoteNumbers(licenseeAccountId) {
      if (staleNumberLists.remaining > 0) {
        staleNumberLists.remaining -= 1;
        return [];
      }
      const stored = [...quotes.values()]
        .filter(
          (quote) =>
            quote.licensee_account_id === licenseeAccountId && quote.quote_number,
        )
        .map((quote) => quote.quote_number as string);
      return [...stored, ...extraNumbers];
    },
    async copyLogo(input): Promise<ClientQuoteIssuedLogoSnapshot> {
      logoCopies.push(input);
      if (failLogo.on) throw new Error("storage unavailable");
      const storagePath = buildClientQuoteLogoObjectPath({
        quoteId: input.quoteId,
        mimeType: "image/png",
        objectId: createHash("sha256").update(input.quoteId).digest("hex").slice(0, 12),
      });
      return {
        storagePath,
        mimeType: "image/png",
        contentHash: "ab".repeat(32),
      };
    },
    async removeLogo(storagePath, quoteId) {
      removedLogos.push(assertClientQuoteLogoRemovalPath(storagePath, quoteId));
    },
    now() {
      return now;
    },
    newId() {
      const suffix = idSequence.toString(16).padStart(12, "0");
      idSequence += 1;
      return `11111111-1111-4111-8111-${suffix}`;
    },
  };

  return {
    deps,
    quotes,
    organizationReads,
    websiteReads,
    estimateReads,
    logoCopies,
    removedLogos,
    get issueWrites() {
      return issueWrites;
    },
    get maskWrites() {
      return maskWrites;
    },
    setNow(value: string) {
      now = value;
    },
    failLogo,
    failIssue,
    extraNumbers,
    staleNumberLists,
  };
}

async function expectCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof ClientQuoteOperationError);
    assert.equal(error.code, code);
    return true;
  });
}

function issuable(draft: ClientQuoteDraftV1, legalName = draft.issuer.legalName): ClientQuoteDraftV1 {
  return {
    ...draft,
    issuer: { ...draft.issuer, legalName: legalName || "Alpha Studio Ltd" },
    paymentTerms: { summary: "Due on receipt.", scheduleNote: null },
    validity: { validForDays: 14, validUntil: null, note: null },
    totals: {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    },
  };
}

describe("quotation authorization and seeding", () => {
  it("requires a Master and ignores client tenant ids", async () => {
    const harness = createHarness();
    await assert.rejects(
      () => listClientQuotesForMaster(USER_NONE, harness.deps),
      (error: unknown) => error instanceof Error && error.name === "LicenseeAccessError",
    );
    const quote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    assert.equal(quote.licensee_account_id, LICENSEE_A);
    assert.equal(quote.organization_id, ORG_CLIENT);
    assert.equal(quote.requested_by, USER_A);
    assert.equal(quote.status, "draft");
    assert.equal(quote.quote_number, null);
    assert.equal(JSON.stringify(quote).includes("SECRET_CONTEXT"), false);
    assert.equal(JSON.stringify(quote).includes("provisional-login"), false);
    assert.equal(JSON.stringify(quote).includes("owner-login"), false);
    assert.equal(harness.estimateReads[0]?.licenseeAccountId, LICENSEE_A);
  });

  it("hides another Licensee's Estimate and quotation", async () => {
    const harness = createHarness();
    const quote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_B,
          estimateId: ESTIMATE,
          recipient: { kind: "client" },
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        getClientQuoteForMaster({
          masterUserId: USER_B,
          quoteId: quote.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal((await listClientQuotesForMaster(USER_B, harness.deps)).length, 0);
    assert.equal(harness.quotes.size, 1);
  });

  it("requires a Ready Estimate package owned through the Licensee relationship", async () => {
    const harness = createHarness();
    const estimate = await harness.deps.getEstimate(ESTIMATE, LICENSEE_A);
    assert.ok(estimate);
    estimate.status = "Processing";
    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "client" },
          deps: {
            ...harness.deps,
            getEstimate: async () => estimate,
          },
        }),
      "ESTIMATE_NOT_READY",
    );
    estimate.status = "Ready";
    estimate.package_json = { schemaVersion: "estimate_v0" };
    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "client" },
          deps: {
            ...harness.deps,
            getEstimate: async () => estimate,
          },
        }),
      "ESTIMATE_PACKAGE_INVALID",
    );
    await assert.rejects(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "client" },
          deps: {
            ...harness.deps,
            assertOwnsOrganization: async () => {
              throw licenseeAccess("Master does not own this sub-account relationship.");
            },
          },
        }),
      (error: unknown) => error instanceof Error && error.name === "LicenseeAccessError",
    );
    assert.equal(harness.quotes.size, 0);
  });

  it("maps Own Company issuer fields and athena identity website", async () => {
    const harness = createHarness();
    const quote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      contentLanguage: "en",
      deps: harness.deps,
    });
    assert.equal(quote.draft_json.issuer.legalName, "Alpha Studio Ltd");
    assert.equal(quote.draft_json.issuer.tradingName, "Alpha Studio");
    assert.equal(quote.draft_json.issuer.email, "billing@alpha.example");
    assert.equal(quote.draft_json.issuer.website, "https://alpha.example");
    assert.equal(quote.draft_json.issuer.jobTitle, "Managing Director");
    assert.equal(quote.draft_json.issuer.contactName, "Ada Lovelace");
    assert.equal(quote.draft_json.issuer.postalAddress.line1, "1 High Street");
    assert.equal(quote.draft_json.issuer.taxIdentifierLabel, "VAT");
    assert.deepEqual(harness.websiteReads, [ORG_OWN]);
    assert.equal(quote.content_language, "en");
    assert.equal(quote.currency_code, "USD");
    assert.equal(quote.draft_json.currencyScale, 2);
    assert.equal(quote.draft_json.totals.totalMinor, 10000);
    assert.equal(quote.source_estimate_snapshot?.estimateId, ESTIMATE);
    assert.equal(quote.source_estimate_snapshot?.recommendedClientPriceMinor, 10000);
  });

  it("maps a Prospect or client recipient without using login email", async () => {
    const harness = createHarness();
    const clientQuote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    assert.equal(clientQuote.draft_json.customer.name, "Northwind Traders Ltd");
    assert.equal(clientQuote.draft_json.customer.email, "ap@northwind.example");
    assert.equal(clientQuote.draft_json.customer.jobTitle, "Buyer");
    assert.equal(clientQuote.content_language, "fr");

    const prospectQuote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "prospect", prospectId: PROSPECT },
      deps: harness.deps,
    });
    assert.equal(prospectQuote.draft_json.customer.name, "Fabrikam Inc");
    assert.equal(prospectQuote.draft_json.customer.email, "buyer@fabrikam.example");
    assert.equal(prospectQuote.draft_json.customer.contactName, "Sam");
    assert.equal(prospectQuote.draft_json.customer.taxIdentifier, "FR123");
    assert.equal(prospectQuote.organization_id, ORG_CLIENT);

    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "prospect", prospectId: ORG_FOREIGN },
          deps: harness.deps,
        }),
      "RECIPIENT_UNAVAILABLE",
    );
  });

  it("uses a deleted Prospect name snapshot and keeps other recipient paths", async () => {
    const harness = createHarness();
    const prospectReads: string[] = [];
    const base = await harness.deps.getEstimate(ESTIMATE, LICENSEE_A);
    assert.ok(base);

    function depsFor(estimate: ClientQuoteEstimateRecord): ClientQuoteDeps {
      return {
        ...harness.deps,
        getEstimate: async (estimateId, licenseeAccountId) => {
          if (licenseeAccountId !== LICENSEE_A || estimateId !== estimate.id) return null;
          if (estimate.licensee_account_id !== LICENSEE_A) return null;
          return structuredClone(estimate);
        },
        getProspect: async (prospectId, organizationId) => {
          prospectReads.push(`${prospectId}:${organizationId}`);
          return harness.deps.getProspect(prospectId, organizationId);
        },
      };
    }

    const live = {
      ...base,
      prospect_id: PROSPECT,
      prospect_business_name_snapshot: "Old Dental Name",
    };
    prospectReads.length = 0;
    const liveQuote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "prospect", prospectId: PROSPECT },
      deps: depsFor(live),
    });
    assert.equal(liveQuote.draft_json.customer.name, "Fabrikam Inc");
    assert.equal(liveQuote.draft_json.customer.email, "buyer@fabrikam.example");
    assert.equal(liveQuote.draft_json.customer.postalAddress.line1, "9 Market");
    assert.equal(JSON.stringify(liveQuote.draft_json.customer).includes("Old Dental Name"), false);
    assert.deepEqual(prospectReads, [`${PROSPECT}:${ORG_CLIENT}`]);
    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "removedProspect" },
          deps: depsFor(live),
        }),
      "RECIPIENT_UNAVAILABLE",
    );

    const deleted = {
      ...base,
      prospect_id: null,
      prospect_business_name_snapshot: "  ABC Dental  ",
    };
    const quotesBeforeDeleted = harness.quotes.size;
    prospectReads.length = 0;
    const deletedQuote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "removedProspect" },
      deps: depsFor(deleted),
    });
    assert.deepEqual(deletedQuote.draft_json.customer, {
      name: "ABC Dental",
      contactName: null,
      jobTitle: null,
      postalAddress: {
        line1: null,
        line2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
      },
      phone: null,
      email: null,
      taxIdentifier: null,
    });
    assert.equal(prospectReads.length, 0);
    assert.equal(
      JSON.stringify(deletedQuote.draft_json.customer).includes("Northwind"),
      false,
    );
    assert.equal(
      JSON.stringify(deletedQuote.draft_json.customer).includes("2 Dock Street"),
      false,
    );
    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "client" },
          deps: depsFor(deleted),
        }),
      "RECIPIENT_UNAVAILABLE",
    );
    assert.equal(harness.quotes.size, quotesBeforeDeleted + 1);

    const organizationOnly = {
      ...base,
      prospect_id: null,
      prospect_business_name_snapshot: "   ",
    };
    const organizationQuote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: depsFor(organizationOnly),
    });
    assert.equal(organizationQuote.draft_json.customer.name, "Northwind Traders Ltd");
    assert.equal(organizationQuote.draft_json.customer.email, "ap@northwind.example");
    await expectCode(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_A,
          estimateId: ESTIMATE,
          recipient: { kind: "removedProspect" },
          deps: depsFor(organizationOnly),
        }),
      "RECIPIENT_UNAVAILABLE",
    );

    const parsed = parseCreateClientQuoteBody({
      estimateId: ESTIMATE,
      licenseeAccountId: LICENSEE_B,
      organizationId: ORG_FOREIGN,
      recipient: {
        kind: "removedProspect",
        prospectId: PROSPECT,
        prospectBusinessNameSnapshot: "Spoofed Clinic",
        name: "Spoofed Clinic",
        customer: { name: "Spoofed Clinic" },
      },
    });
    assert.equal(isClientQuoteHttpFailure(parsed), false);
    if (!isClientQuoteHttpFailure(parsed)) {
      assert.deepEqual(parsed.recipient, { kind: "removedProspect" });
      assert.equal(JSON.stringify(parsed).includes("Spoofed Clinic"), false);
      assert.equal("licenseeAccountId" in parsed, false);
      const authoritative = await createClientQuoteDraftForMaster({
        masterUserId: USER_A,
        estimateId: parsed.estimateId,
        recipient: parsed.recipient,
        deps: depsFor(deleted),
      });
      assert.equal(authoritative.draft_json.customer.name, "ABC Dental");
      assert.equal(authoritative.licensee_account_id, LICENSEE_A);
    }

    await assert.rejects(
      () =>
        createClientQuoteDraftForMaster({
          masterUserId: USER_B,
          estimateId: ESTIMATE,
          recipient: { kind: "removedProspect" },
          deps: depsFor(deleted),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ClientQuoteOperationError);
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.message.includes("ABC Dental"), false);
        assert.equal(error.message.includes("Spoofed Clinic"), false);
        return true;
      },
    );
    assert.equal(
      [...harness.quotes.values()].some(
        (quote) => quote.licensee_account_id === LICENSEE_B,
      ),
      false,
    );
    assert.equal(
      [...harness.quotes.values()].some((quote) =>
        JSON.stringify(quote).includes("Spoofed Clinic"),
      ),
      false,
    );
  });

  it("saves a draft when legal details are missing and blocks issue", async () => {
    const harness = createHarness();
    const incomplete = ownCompany({
      legal_name: null,
      business_email: null,
    });
    const quote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: {
        ...harness.deps,
        requireMaster: async (masterUserId) => ({
          ...(await harness.deps.requireMaster(masterUserId)),
          ownCompanyOrganizationId: null,
        }),
      },
    });
    assert.equal(quote.status, "draft");
    assert.equal(quote.draft_json.issuer.legalName, "");
    await expectCode(
      () =>
        issueClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: quote.id,
          deps: harness.deps,
        }),
      "ISSUER_INCOMPLETE",
    );

    const mapped = mapOrganizationCommercialIdentityToDraftIssuerSnapshot(incomplete, null);
    assert.equal(mapped.legalName, "");
    assert.equal(mapped.email, null);
    assert.equal(mapped.tradingName, "Alpha Studio");
    const withLogin = mapOrganizationCommercialIdentityToDraftIssuerSnapshot(
      { ...incomplete, business_email: "billing@alpha.example" },
      null,
    );
    assert.equal(withLogin.email, "billing@alpha.example");
    assert.notEqual(withLogin.email, "provisional-login@getoblic.com");

    harness.organizationReads.length = 0;
    const foreign = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: {
        ...harness.deps,
        requireMaster: async (masterUserId) => ({
          ...(await harness.deps.requireMaster(masterUserId)),
          ownCompanyOrganizationId: ORG_FOREIGN,
        }),
      },
    });
    assert.equal(foreign.draft_json.issuer.legalName, "");
    assert.equal(harness.organizationReads.includes(ORG_FOREIGN), false);
    assert.equal(harness.websiteReads.includes(ORG_FOREIGN), false);
  });
});

describe("draft totals, issue, and revision", () => {
  it("recalculates totals and rejects malformed money", async () => {
    const harness = createHarness();
    const jpy = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: {
        ...harness.deps,
        getEstimate: async () => ({
          id: ESTIMATE,
          licensee_account_id: LICENSEE_A,
          organization_id: ORG_CLIENT,
          organization_name_snapshot: "Northwind",
          prospect_id: null,
          prospect_business_name_snapshot: null,
          status: "Ready",
          package_json: readyPackage(1500, "JPY"),
        }),
      },
    });
    assert.equal(jpy.currency_code, "JPY");
    assert.equal(jpy.draft_json.currencyScale, 0);
    assert.equal(jpy.draft_json.totals.totalMinor, 1500);

    const quote = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    harness.setNow("2026-10-09T10:00:00.000Z");
    const updated = await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: quote.id,
      contentLanguage: "de",
      draft: {
        ...quote.draft_json,
        lineItems: [
          {
            id: "line-1",
            description: "Portal rebuild",
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 10000,
            lineTotalMinor: 1,
          },
        ],
        discount: { kind: "percentage", ratePpm: 100_000 },
        tax: { kind: "percentage", ratePpm: 100_000, label: "VAT" },
        totals: {
          subtotalMinor: 1,
          discountMinor: 1,
          taxableMinor: 1,
          taxMinor: 1,
          totalMinor: 1,
        },
        finalTotal: 1,
      },
      deps: harness.deps,
    });
    assert.equal(updated.content_language, "de");
    assert.equal(updated.currency_code, "USD");
    assert.equal(updated.draft_json.totals.subtotalMinor, 10000);
    assert.equal(updated.draft_json.totals.discountMinor, 1000);
    assert.equal(updated.draft_json.totals.taxableMinor, 9000);
    assert.equal(updated.draft_json.totals.taxMinor, 900);
    assert.equal(updated.draft_json.totals.totalMinor, 9900);
    assert.equal(updated.draft_json.lineItems[0]?.lineTotalMinor, 10000);
    assert.equal("finalTotal" in updated.draft_json, false);
    assert.equal(updated.licensee_account_id, LICENSEE_A);

    await expectCode(
      () =>
        updateClientQuoteDraftForMaster({
          masterUserId: USER_A,
          quoteId: quote.id,
          draft: {
            ...updated.draft_json,
            discount: { kind: "fixed", amountMinor: 99_000 },
          },
          deps: harness.deps,
        }),
      "INVALID_CLIENT_QUOTE",
    );
    const stored = await getClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: quote.id,
      deps: harness.deps,
    });
    assert.equal(stored.draft_json.totals.totalMinor, 9900);
  });

  it("freezes brand, rejects issued edits, and keeps revisions independent", async () => {
    const harness = createHarness();
    const created = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "prospect", prospectId: PROSPECT },
      deps: harness.deps,
    });
    harness.setNow("2026-10-09T12:00:00.000Z");
    const ready = await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: created.id,
      draft: issuable(created.draft_json),
      deps: harness.deps,
    });
    const issued = await issueClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: ready.id,
      deps: harness.deps,
    });
    assert.equal(issued.status, "issued");
    assert.equal(issued.quote_number, "Q-2026-0001");
    assert.equal(issued.issued_snapshot_json?.brand.primaryColor, "#112233");
    assert.equal(issued.issued_snapshot_json?.brand.secondaryColor, "#445566");
    assert.equal(issued.issued_snapshot_json?.brand.font, "georgia");
    assert.equal(issued.issued_snapshot_json?.brand.logo?.mimeType, "image/png");
    assert.equal(issued.issued_snapshot_json?.brand.logo?.contentHash, "ab".repeat(32));
    assert.match(
      issued.issued_snapshot_json?.brand.logo?.storagePath ?? "",
      new RegExp(`^quotes/${issued.id}/logo/`),
    );
    assert.equal(
      (issued.issued_snapshot_json?.brand.logo?.storagePath ?? "").includes("identity/logo"),
      false,
    );
    assert.equal(issued.issued_snapshot_json?.sourceEstimate?.estimateId, ESTIMATE);
    assert.equal(harness.logoCopies[0]?.sourceOrganizationId, ORG_OWN);
    assert.match(harness.logoCopies[0]?.sourcePath ?? "", /live\.png$/);
    const copies = harness.logoCopies.length;
    const repeated = await issueClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issued.id,
      deps: harness.deps,
    });
    assert.equal(repeated.quote_number, issued.quote_number);
    assert.equal(harness.logoCopies.length, copies);

    const published = toPublicClientQuote(issued);
    assert.equal("storagePath" in (published.issuedSnapshot?.brand.logo ?? {}), false);
    assert.equal("licenseeAccountId" in (published.issuedSnapshot ?? {}), false);
    assert.equal(JSON.stringify(published).includes("live.png"), false);
    assert.equal(JSON.stringify(published).includes("SECRET_CONTEXT"), false);
    assert.equal(published.issuedSnapshot?.brand.logo?.contentHash, "ab".repeat(32));

    await expectCode(
      () =>
        updateClientQuoteDraftForMaster({
          masterUserId: USER_A,
          quoteId: issued.id,
          draft: {
            ...issued.draft_json,
            projectTitle: "Changed",
          },
          deps: harness.deps,
        }),
      "ISSUED_IMMUTABLE",
    );

    harness.setNow("2026-10-09T13:00:00.000Z");
    const revision = await reviseClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issued.id,
      deps: harness.deps,
    });
    assert.equal(revision.status, "draft");
    assert.equal(revision.quote_number, null);
    assert.equal(revision.issued_snapshot_json, null);
    assert.equal(revision.revised_from_quote_id, issued.id);
    assert.notEqual(revision.id, issued.id);
    assert.equal(revision.source_estimate_snapshot?.estimateId, ESTIMATE);
    assert.equal("brand" in revision.draft_json, false);
    const changed = await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: revision.id,
      draft: {
        ...revision.draft_json,
        issuer: { ...revision.draft_json.issuer, legalName: "Revision Studio Ltd" },
        projectTitle: "Revised portal",
      },
      deps: harness.deps,
    });
    assert.equal(changed.draft_json.issuer.legalName, "Revision Studio Ltd");
    const original = await getClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issued.id,
      deps: harness.deps,
    });
    assert.equal(original.status, "issued");
    assert.equal(original.quote_number, "Q-2026-0001");
    assert.equal(original.draft_json.issuer.legalName, "Alpha Studio Ltd");
    assert.equal(original.issued_snapshot_json?.issuer.legalName, "Alpha Studio Ltd");
    assert.equal(original.issued_snapshot_json?.projectTitle, issued.draft_json.projectTitle);
  });

  it("assigns unique numbers under conflict and concurrent issue", async () => {
    const harness = createHarness();
    harness.extraNumbers.push("Q-2026-0004", "Q-2025-0099", "NOT-A-NUMBER");
    const first = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    harness.setNow("2026-10-09T12:00:00.000Z");
    await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: first.id,
      draft: issuable(first.draft_json),
      deps: harness.deps,
    });
    const issued = await issueClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: first.id,
      deps: harness.deps,
    });
    assert.equal(issued.quote_number, "Q-2026-0005");

    const second = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: second.id,
      draft: issuable(second.draft_json),
      deps: harness.deps,
    });
    let conflicts = 0;
    const conflictingDeps: ClientQuoteDeps = {
      ...harness.deps,
      issueQuote: async (quote) => {
        if (conflicts < 1) {
          conflicts += 1;
          return { ok: false, reason: "conflict" };
        }
        return harness.deps.issueQuote(quote);
      },
    };
    const retried = await issueClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: second.id,
      deps: conflictingDeps,
    });
    assert.equal(retried.quote_number, "Q-2026-0007");
    assert.equal(conflicts, 1);

    const left = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    const right = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: left.id,
      draft: issuable(left.draft_json),
      deps: harness.deps,
    });
    await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: right.id,
      draft: issuable(right.draft_json),
      deps: harness.deps,
    });
    harness.staleNumberLists.remaining = 2;
    const [leftIssued, rightIssued] = await Promise.all([
      issueClientQuoteForMaster({
        masterUserId: USER_A,
        quoteId: left.id,
        deps: harness.deps,
      }),
      issueClientQuoteForMaster({
        masterUserId: USER_A,
        quoteId: right.id,
        deps: harness.deps,
      }),
    ]);
    assert.notEqual(leftIssued.quote_number, rightIssued.quote_number);
    assert.match(leftIssued.quote_number ?? "", /^Q-2026-\d{4}$/);
    assert.match(rightIssued.quote_number ?? "", /^Q-2026-\d{4}$/);
  });

  it("keeps the draft when logo copy or the issue write fails", async () => {
    const harness = createHarness();
    const created = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    harness.setNow("2026-10-09T12:00:00.000Z");
    await updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: created.id,
      draft: issuable(created.draft_json),
      deps: harness.deps,
    });
    harness.failLogo.on = true;
    const writesBefore = harness.issueWrites;
    await expectCode(
      () =>
        issueClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: created.id,
          deps: harness.deps,
        }),
      "LOGO_COPY_FAILED",
    );
    assert.equal(harness.issueWrites, writesBefore);
    const stillDraft = await getClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: created.id,
      deps: harness.deps,
    });
    assert.equal(stillDraft.status, "draft");
    assert.equal(stillDraft.quote_number, null);

    harness.failLogo.on = false;
    harness.failIssue.on = true;
    await expectCode(
      () =>
        issueClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: created.id,
          deps: harness.deps,
        }),
      "PERSISTENCE_FAILED",
    );
    assert.equal(harness.removedLogos.length, 1);
    assert.match(harness.removedLogos[0] ?? "", /^quotes\//);
    const afterWriteFailure = await getClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: created.id,
      deps: harness.deps,
    });
    assert.equal(afterWriteFailure.status, "draft");
  });
});

describe("client quotation masking", () => {
  async function issuableDraft(harness: Harness) {
    const created = await createClientQuoteDraftForMaster({
      masterUserId: USER_A,
      estimateId: ESTIMATE,
      recipient: { kind: "client" },
      deps: harness.deps,
    });
    return updateClientQuoteDraftForMaster({
      masterUserId: USER_A,
      quoteId: created.id,
      draft: issuable(created.draft_json),
      deps: harness.deps,
    });
  }

  it("soft-masks drafts and issued quotations without deleting history", async () => {
    const harness = createHarness();
    const draft = await issuableDraft(harness);
    const estimateBefore = harness.estimateReads.length;
    harness.setNow("2026-10-09T11:00:00.000Z");
    const maskedDraft = await maskClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: draft.id,
      deps: harness.deps,
    });
    assert.equal(maskedDraft.alreadyMasked, false);
    assert.equal(harness.maskWrites, 1);
    const storedDraft = harness.quotes.get(draft.id);
    assert.ok(storedDraft);
    assert.equal(storedDraft.status, "draft");
    assert.equal(storedDraft.quote_number, null);
    assert.equal(storedDraft.deleted_at, "2026-10-09T11:00:00.000Z");
    assert.equal(storedDraft.source_estimate_id, ESTIMATE);
    assert.equal(harness.removedLogos.length, 0);
    assert.equal(harness.estimateReads.length, estimateBefore);
    const repeatedDraft = await maskClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: draft.id,
      deps: harness.deps,
    });
    assert.equal(repeatedDraft.alreadyMasked, true);
    assert.equal(harness.maskWrites, 1);
    assert.equal(
      harness.quotes.get(draft.id)?.updated_at,
      "2026-10-09T11:00:00.000Z",
    );
    await expectCode(
      () =>
        getClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: draft.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(
      (await listClientQuotesForMaster(USER_A, harness.deps)).some(
        (quote) => quote.id === draft.id,
      ),
      false,
    );

    const issuedSource = await issuableDraft(harness);
    const issued = await issueClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issuedSource.id,
      deps: harness.deps,
    });
    assert.equal(issued.quote_number, "Q-2026-0001");
    const revision = await reviseClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issued.id,
      deps: harness.deps,
    });
    const frozen = structuredClone(harness.quotes.get(issued.id));
    assert.ok(frozen?.issued_snapshot_json);
    harness.setNow("2026-10-09T12:00:00.000Z");
    const maskedIssued = await maskClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issued.id,
      deps: harness.deps,
    });
    assert.equal(maskedIssued.alreadyMasked, false);
    const storedIssued = harness.quotes.get(issued.id);
    assert.ok(storedIssued);
    assert.equal(storedIssued.status, "issued");
    assert.equal(storedIssued.quote_number, "Q-2026-0001");
    assert.equal(storedIssued.deleted_at, "2026-10-09T12:00:00.000Z");
    assert.deepEqual(storedIssued.issued_snapshot_json, frozen.issued_snapshot_json);
    assert.equal(storedIssued.source_estimate_id, frozen.source_estimate_id);
    assert.deepEqual(
      storedIssued.source_estimate_snapshot,
      frozen.source_estimate_snapshot,
    );
    assert.equal(harness.removedLogos.length, 0);
    const stillThere = await harness.deps.getEstimate(ESTIMATE, LICENSEE_A);
    assert.equal(stillThere?.id, ESTIMATE);
    assert.equal(stillThere?.status, "Ready");
    const linked = await getClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: revision.id,
      deps: harness.deps,
    });
    assert.equal(linked.revised_from_quote_id, issued.id);
    assert.equal(linked.deleted_at, null);

    await expectCode(
      () =>
        getClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        updateClientQuoteDraftForMaster({
          masterUserId: USER_A,
          quoteId: issued.id,
          draft: issuable(issued.draft_json),
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        issueClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        reviseClientQuoteForMaster({
          masterUserId: USER_A,
          quoteId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        loadIssuedClientQuoteSnapshotForPdf({
          masterUserId: USER_A,
          quoteId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    await expectCode(
      () =>
        maskClientQuoteForMaster({
          masterUserId: USER_B,
          quoteId: issued.id,
          deps: harness.deps,
        }),
      "NOT_FOUND",
    );
    assert.equal(harness.quotes.get(issued.id)?.deleted_at, "2026-10-09T12:00:00.000Z");
    const listed = await listClientQuotesForMaster(USER_A, harness.deps);
    assert.equal(
      listed.some((quote) => quote.id === issued.id || quote.id === draft.id),
      false,
    );
    assert.equal(
      listed.some((quote) => quote.id === revision.id),
      true,
    );
    const numbers = await harness.deps.listQuoteNumbers(LICENSEE_A);
    assert.ok(numbers.includes("Q-2026-0001"));

    const again = await maskClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: issued.id,
      deps: harness.deps,
    });
    assert.equal(again.alreadyMasked, true);
    assert.equal(harness.quotes.get(issued.id)?.updated_at, "2026-10-09T12:00:00.000Z");

    const nextSource = await issuableDraft(harness);
    const nextIssued = await issueClientQuoteForMaster({
      masterUserId: USER_A,
      quoteId: nextSource.id,
      deps: harness.deps,
    });
    assert.equal(nextIssued.quote_number, "Q-2026-0002");
    assert.notEqual(nextIssued.quote_number, storedIssued.quote_number);
  });

  it("masks through an owned delete route and keeps numbering history", () => {
    const route = read("app/api/licensee/client-quotes/[id]/route.ts");
    const persistence = read("services/clientQuote/clientQuotePersistence.ts");
    const maskStart = persistence.indexOf("async maskQuote");
    const maskEnd = persistence.indexOf("async listQuoteNumbers");
    const mask = persistence.slice(maskStart, maskEnd);
    assert.match(route, /export async function DELETE/);
    assert.match(route, /maskClientQuoteForMaster/);
    assert.match(route, /requireMaster|masterUserId/);
    assert.doesNotMatch(route, /licenseeAccountId|licensee_account_id|organizationId/);
    assert.match(mask, /deleted_at: decision\.quote\.deleted_at/);
    assert.match(mask, /updated_at: decision\.quote\.updated_at/);
    assert.match(mask, /\.eq\("licensee_account_id", licenseeAccountId\)/);
    assert.match(mask, /\.is\("deleted_at", null\)/);
    assert.doesNotMatch(mask, /\.delete\(|removeLogo|getEstimate|issued_snapshot_json/);
    assert.match(persistence, /filter\(\(quote\) => !quote\.deleted_at\)/);
    const numbers = persistence.slice(persistence.indexOf("async listQuoteNumbers"));
    assert.doesNotMatch(numbers.slice(0, 500), /deleted_at/);
    assert.doesNotMatch(route, /openrouter|workers\//i);
  });
});

describe("quotation API and storage contracts", () => {
  it("parses create and update bodies without tenant authority fields", () => {
    const created = parseCreateClientQuoteBody({
      estimateId: ESTIMATE,
      licenseeAccountId: LICENSEE_B,
      organizationId: ORG_FOREIGN,
      recipient: {
        kind: "client",
        organizationId: ORG_FOREIGN,
      },
      totals: { totalMinor: 1 },
      contentLanguage: "it",
    });
    assert.equal(isClientQuoteHttpFailure(created), false);
    if (!isClientQuoteHttpFailure(created)) {
      assert.equal(created.estimateId, ESTIMATE);
      assert.deepEqual(created.recipient, { kind: "client" });
      assert.equal("licenseeAccountId" in created, false);
      assert.equal(created.contentLanguage, "it");
    }
    const prospect = parseCreateClientQuoteBody({
      estimateId: ESTIMATE,
      recipient: { kind: "prospect", prospectId: PROSPECT },
    });
    assert.equal(isClientQuoteHttpFailure(prospect), false);
    const missing = parseUpdateClientQuoteBody({
      licenseeAccountId: LICENSEE_B,
      quoteNumber: "Q-1",
    });
    assert.equal(isClientQuoteHttpFailure(missing), true);
    const updated = parseUpdateClientQuoteBody({
      draft: { issuer: { legalName: "Alpha Studio Ltd" } },
      organizationId: ORG_FOREIGN,
      contentLanguage: "pt",
    });
    if (!isClientQuoteHttpFailure(updated)) {
      assert.equal(updated.contentLanguage, "pt");
      assert.equal("organizationId" in updated, false);
    }
  });

  it("builds quote-owned logo paths and drops unapproved brand values", () => {
    const quoteId = "11111111-1111-4111-8111-111111111111";
    const path = buildClientQuoteLogoObjectPath({
      quoteId,
      mimeType: "image/png",
      objectId: "abc123",
    });
    assert.equal(path, `quotes/${quoteId}/logo/abc123.png`);
    assert.throws(() => assertClientQuoteLogoRemovalPath(`${ORG_OWN}/identity/logo/live.png`, quoteId));
    const frozen = freezeOrganizationBrand({
      brand: {
        brand_primary_color: "#112233",
        brand_font: "comic sans",
        brand_logo_storage_path: `${ORG_OWN}/identity/logo/live.png`,
      },
      logo: {
        storagePath: path,
        mimeType: "image/png",
        contentHash: "ab".repeat(32),
      },
    });
    assert.equal(frozen.primaryColor, "#112233");
    assert.equal(frozen.font, null);
    assert.equal(frozen.logo?.storagePath, path);
    assert.equal(JSON.stringify(frozen).includes("live.png"), false);
    assert.equal(nextClientQuoteSequence(["Q-2026-0004", "Q-2025-0099"], 2026), 5);
    assert.equal(formatClientQuoteNumber(2026, 5), "Q-2026-0005");
    assert.equal(
      mapProspectToCustomerSnapshot({ business_name: "Fabrikam" })?.name,
      "Fabrikam",
    );
    assert.equal(
      mapOrganizationToCustomerSnapshot({
        name: "Northwind",
        business_email: "ap@northwind.example",
      })?.email,
      "ap@northwind.example",
    );
  });

  it("keeps routes Master-only and leaves the GHL quote page unchanged", () => {
    const files = [
      "services/clientQuote/clientQuoteService.ts",
      "services/clientQuote/clientQuotePersistence.ts",
      "services/clientQuote/clientQuoteHttp.ts",
      "app/api/licensee/client-quotes/route.ts",
      "app/api/licensee/client-quotes/[id]/route.ts",
      "app/api/licensee/client-quotes/[id]/issue/route.ts",
      "app/api/licensee/client-quotes/[id]/revise/route.ts",
    ];
    const source = files.map((file) => read(file)).join("\n");
    assert.doesNotMatch(source, /openrouter|aiService|generateReview|athenaWorker|enqueueAthena/i);
    assert.doesNotMatch(
      source,
      /resolveAuthorizedSubAccountHandoff|provisionalClientAccountEmail|hydrateLicenseeProspectClientCommercialIdentity/,
    );
    assert.doesNotMatch(source, /prospect_generation_context|website_intelligence/);

    const service = read("services/clientQuote/clientQuoteService.ts");
    assert.match(service, /requireMaster\(input\.masterUserId\)|deps\.requireMaster/);
    assert.match(service, /master\.licenseeAccountId/);
    assert.doesNotMatch(service, /calculateClientQuote|unitPriceMinor \*/);
    assert.match(service, /updateDraftClientQuote/);
    assert.equal(CLIENT_QUOTE_ROUNDING_CONTRACT, "half-away-from-zero");

    const persistence = read("services/clientQuote/clientQuotePersistence.ts");
    assert.match(persistence, /requireLicenseeMasterAccount/);
    assert.match(persistence, /assertLicenseeOwnsSubAccount/);
    assert.match(persistence, /getAthenaEstimateByIdForLicensee/);
    assert.match(persistence, /\.eq\("licensee_account_id", licenseeAccountId\)/);
    assert.match(persistence, /\.eq\("licensee_account_id", quote\.licensee_account_id\)/);
    assert.match(persistence, /\.eq\("status", "draft"\)/);
    assert.match(persistence, /23505/);
    assert.match(persistence, /BRAND_LOGO_BUCKET/);
    assert.match(persistence, /select\("website"\)/);
    assert.match(persistence, /buildClientQuoteLogoObjectPath/);
    assert.doesNotMatch(persistence, /\.select\("\*"\)[\s\S]{0,80}athena_identity/);

    for (const file of files.filter((item) => item.startsWith("app/"))) {
      const route = read(file);
      assert.match(route, /createSupabaseServerClient/);
      assert.match(route, /auth\.getUser/);
      assert.match(route, /UNAUTHORIZED/);
      assert.match(route, /toPublicClientQuote/);
      assert.match(route, /clientQuoteFailure/);
      assert.doesNotMatch(route, /LICENSEE_MASTER_MARKER|cookies\(\)\.get/);
      assert.doesNotMatch(route, /body\.licenseeAccountId|body\.organizationId|quoteNumber/);
    }

    const ghl = read("app/licensee/quote/page.tsx");
    assert.match(ghl, /AthenaQuoteFormEmbed/);
    assert.doesNotMatch(ghl, /client-quotes|clientQuote/);
    const publicQuote = read("app/quote/page.tsx");
    assert.doesNotMatch(publicQuote, /client-quotes|clientQuoteService/);
  });
});
