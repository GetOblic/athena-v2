/**
 * GetOblic listing social import.
 * Mocked database and WordPress. No live Supabase or provider calls.
 */

import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { PostgrestQueryBuilder } from "@supabase/postgrest-js";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import { mapGetOblicListingSocial } from "../../services/getoblicDirectory/getoblicListingSocialImport";
import {
  ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC,
  acquireUnclaimedGetoblicDirectoryProspect,
} from "../../services/getoblicDirectory/unclaimedGetoblicDirectoryAcquisition";
import { LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC } from "../../services/getoblicDirectory/unclaimedGetoblicDirectoryMode";
import type { GetOblicWordpressListing } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { buildWhatsAppMeUrl } from "../../services/prospects/prospectWhatsApp";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const PROSPECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNRELATED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LISTING_ID = 4401;

const RPC_ARGS = [
  "p_organization_id",
  "p_wordpress_listing_id",
  "p_business_name",
  "p_user_id",
  "p_website",
  "p_email",
  "p_phone",
  "p_address",
  "p_city",
  "p_state",
  "p_country",
  "p_category",
  "p_google_business_url",
] as const;

const originalRpc = supabaseAdmin.rpc.bind(supabaseAdmin);
const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = originalRpc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
});

type StoreRow = {
  id: string;
  organization_id: string;
  source: string;
  created_at: string;
  user_id: string | null;
  raw_json: Record<string, unknown>;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  whatsapp_number: string | null;
};

function stamp(listingId = LISTING_ID): Record<string, unknown> {
  return {
    origin: "getoblic_directory",
    wordpress_listing_id: listingId,
    observed: { wordpress_listing_id: listingId },
  };
}

function row(overrides: Partial<StoreRow> = {}): StoreRow {
  return {
    id: PROSPECT,
    organization_id: ORG,
    source: "getoblic",
    created_at: "2026-10-01T00:00:00.000Z",
    user_id: USER,
    raw_json: stamp(),
    facebook: null,
    instagram: null,
    linkedin: null,
    whatsapp_number: null,
    ...overrides,
  };
}

function conflict(error: unknown): boolean {
  return (
    error instanceof GetOblicDirectoryError &&
    error.code === "GETOBLIC_CONCURRENCY_CONFLICT"
  );
}

function socialListing(): GetOblicWordpressListing {
  return listing({
    facebook: " https://facebook.com/acme ",
    instagram: "https://instagram.com/acme",
    linkedin: "https://linkedin.com/company/acme",
    whatsapp: "+1 (512) 555-0100",
  });
}

function acquireSocial(
  getListingById: () => Promise<GetOblicWordpressListing> = async () => socialListing(),
) {
  return acquireUnclaimedGetoblicDirectoryProspect(
    {
      organizationId: ORG,
      actorUserId: USER,
      wordpressListingId: LISTING_ID,
    },
    { getListingById },
  );
}

function listing(
  overrides: Partial<GetOblicWordpressListing> = {},
): GetOblicWordpressListing {
  return {
    wordpress_listing_id: LISTING_ID,
    status: "publish",
    title: "Acme Salon",
    author_id: 999,
    google_id: "places/acme",
    google_place_url: "https://maps.example/acme",
    knowledge_base: "do not import",
    phone: "214-555-0100",
    address: "100 Oak St",
    region: { term_id: 8, slug: "dallas", name: "Dallas" },
    website: "https://acme.example",
    email: "hi@acme.example",
    category: [{ term_id: 5, slug: "salon", name: "Hair Salon" }],
    ...overrides,
  };
}

function matches(candidate: StoreRow, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, expected]) => {
    if (column === "raw_json->>origin") {
      return candidate.raw_json.origin === expected;
    }
    if (column === "raw_json->>wordpress_listing_id") {
      return String(expected).includes(String(candidate.raw_json.wordpress_listing_id));
    }
    return candidate[column as keyof StoreRow] === expected;
  });
}

const BLANK_SOCIAL_OR =
  /^(facebook|instagram|linkedin|whatsapp_number)\.is\.null,\1\.match\."\^\[\[:space:\]\]\*\$"$/;

function isPostgresBlankSocial(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  return /^[\t\n\v\f\r ]*$/.test(value);
}

type SocialUpdateOutcome = "ok" | "error" | "miss" | "ambiguous";

type SocialUpdateAttempt = {
  patch: Record<string, unknown>;
  filters: Record<string, unknown>;
  or: string | null;
  applied: boolean;
};

function installStore(
  rows: StoreRow[],
  options: {
    beforeUpdate?: (patch: Record<string, unknown>, rows: StoreRow[]) => void;
    outcomes?: SocialUpdateOutcome[];
    confirmationErrors?: number;
  } = {},
) {
  const updates: SocialUpdateAttempt[] = [];
  const outcomes = [...(options.outcomes ?? [])];
  let confirmationErrors = options.confirmationErrors ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let patch: Record<string, unknown> | null = null;
    let orFilter: string | null = null;
    let selected = "";
    const builder = {
      select: (columns?: string) => {
        selected = columns ?? "";
        return builder;
      },
      update: (value: Record<string, unknown>) => {
        patch = value;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      or: (value: string) => {
        orFilter = value;
        return builder;
      },
      filter: (column: string, _operator: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => {
        const confirming =
          selected ===
          "id, organization_id, facebook, instagram, linkedin, whatsapp_number";
        if (confirming && confirmationErrors > 0) {
          confirmationErrors -= 1;
          return Promise.resolve({
            data: null,
            error: { message: "confirmation read failed" },
          });
        }
        const matched =
          table === "prospects"
            ? rows.filter((candidate) => matches(candidate, filters))
            : [];
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      then: (
        resolve: (value: { data: unknown; error: { message: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        if (patch) {
          const snapshot = { ...patch };
          options.beforeUpdate?.(snapshot, rows);
          const blankColumn = BLANK_SOCIAL_OR.exec(orFilter ?? "")?.[1] ?? null;
          const patchColumns = Object.keys(snapshot);
          const scoped =
            table === "prospects" &&
            patchColumns.length === 1 &&
            patchColumns[0] === blankColumn &&
            filters.id != null &&
            filters.organization_id != null;
          const outcome = outcomes.shift() ?? "ok";
          const matched =
            scoped && outcome !== "error" && outcome !== "miss"
              ? rows.filter(
                  (candidate) =>
                    matches(candidate, filters) &&
                    isPostgresBlankSocial(
                      candidate[blankColumn as keyof StoreRow],
                    ),
                )
              : [];
          const applied = outcome === "ok" && matched.length === 1;
          if (applied) {
            for (const candidate of matched) {
              Object.assign(candidate, snapshot);
            }
          }
          updates.push({
            patch: snapshot,
            filters: { ...filters },
            or: orFilter,
            applied,
          });
          if (outcome === "error") {
            return Promise.resolve({
              data: null,
              error: { message: "social fill failed" },
            }).then(resolve, reject);
          }
          if (outcome === "ambiguous") {
            return Promise.resolve({
              data: [{ id: "not-a-prospect" }, { id: "also-not" }],
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({
            data: applied ? matched.map((candidate) => ({ id: candidate.id })) : [],
            error: null,
          }).then(resolve, reject);
        }
        const matched =
          table === "prospects"
            ? rows.filter((candidate) => matches(candidate, filters))
            : [];
        return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { updates, rows };
}

function installRpc(
  rows: StoreRow[],
  onAcquire?: (args: Record<string, unknown>) => {
    prospectId: string;
    inserted: boolean;
  },
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).rpc = async (
    fn: string,
    args: Record<string, unknown> = {},
  ) => {
    calls.push({ fn, args });
    if (fn === LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC) {
      return { data: true, error: null };
    }
    if (fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC) {
      const result = onAcquire
        ? onAcquire(args)
        : { prospectId: PROSPECT, inserted: true };
      if (result.inserted) {
        rows.push(
          row({
            id: result.prospectId,
            organization_id: String(args.p_organization_id),
            user_id: typeof args.p_user_id === "string" ? args.p_user_id : null,
            raw_json: stamp(Number(args.p_wordpress_listing_id)),
          }),
        );
      }
      return {
        data: [{ prospect_id: result.prospectId, inserted: result.inserted }],
        error: null,
      };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return calls;
}

describe("GetOblic listing social mapper", () => {
  it("imports dedicated fields, trims them, and keeps a formatted WhatsApp number", () => {
    const mapped = mapGetOblicListingSocial({
      facebook: "  https://facebook.com/acme  ",
      instagram: " https://www.instagram.com/acme ",
      linkedin: "https://linkedin.com/company/acme",
      whatsapp: " +1 (512) 555-0100 ",
      social: [
        { network: "facebook", url: "https://facebook.com/other" },
        { network: "whatsapp", url: "https://wa.me/15125550199" },
      ],
    });
    assert.equal(mapped.facebook, "https://facebook.com/acme");
    assert.equal(mapped.instagram, "https://www.instagram.com/acme");
    assert.equal(mapped.linkedin, "https://linkedin.com/company/acme");
    assert.equal(mapped.whatsapp, "+1 (512) 555-0100");
    assert.equal(buildWhatsAppMeUrl(mapped.whatsapp), "https://wa.me/15125550100");
  });

  it("falls back to social[] only for the named network and recognized host", () => {
    const mapped = mapGetOblicListingSocial({
      facebook: " ",
      instagram: null,
      linkedin: "",
      whatsapp: 15125550100,
      social: [
        { network: "youtube", url: "https://youtube.com/@acme" },
        { network: "facebook", url: "https://instagram.com/wrong-platform" },
        { network: "Facebook", url: "https://fb.com/acme" },
        { network: "instagram", url: "https://instagram.com.evil.com/acme" },
        { network: "instagram", url: "https://instagram.com/acme" },
        { network: "linkedin", url: "https://lnkd.in/acme" },
        { network: "tiktok", url: "https://www.tiktok.com/@acme" },
        { network: "whatsapp", url: "https://example.com/15125550100" },
        { network: "whatsapp", url: "https://wa.me/15125550100?text=Hi" },
      ],
    });
    assert.equal(mapped.facebook, "https://fb.com/acme");
    assert.equal(mapped.instagram, "https://instagram.com/acme");
    assert.equal(mapped.linkedin, "https://lnkd.in/acme");
    assert.equal(mapped.whatsapp, "+15125550100");
    assert.equal(mapped.facebook?.includes("instagram.com"), false);
  });

  it("rejects lookalike hosts, bad protocols, malformed URLs, and cross-platform dedicated values", () => {
    const mapped = mapGetOblicListingSocial({
      facebook: "https://facebook.com.evil.com/acme",
      instagram: "https://facebook.com/should-not-move",
      linkedin: "javascript:alert(1)",
      whatsapp: "https://wa.me.evil.com/15125550100",
      social: [
        { network: "facebook", url: "https://www.facebook.com/fallback" },
        { network: "instagram", url: "https://www.instagram.com/fallback" },
        { network: "linkedin", url: "https://www.linkedin.com/company/fallback" },
        { network: "whatsapp", url: "https://web.whatsapp.com/send?phone=15125550100" },
        { network: "facebook", url: "ftp://facebook.com/acme" },
        { network: "facebook", url: "https://notfacebook.com/acme" },
        { network: "facebook", url: "https://facebook.com%2eevil.com/acme" },
        { network: "instagram", url: "https://user:pass@instagram.com/acme" },
        { network: "linkedin", url: "https://linkedin.com@evil.com/company/acme" },
        { network: "whatsapp", url: "https://chat.whatsapp.com/invite-code" },
        { network: "whatsapp", url: "https://wa.me/123" },
        { network: "whatsapp", url: "not a url" },
      ],
    });
    assert.deepEqual(mapped, {
      facebook: null,
      instagram: null,
      linkedin: null,
      whatsapp: null,
    });
  });

  it("extracts a phone from recognized WhatsApp links and never stores the URL", () => {
    assert.equal(
      mapGetOblicListingSocial({
        whatsapp: "https://wa.me/15125550100/",
      }).whatsapp,
      "+15125550100",
    );
    assert.equal(
      mapGetOblicListingSocial({
        whatsapp: "https://api.whatsapp.com/send/?phone=%2B447911123456",
      }).whatsapp,
      "+447911123456",
    );
    assert.equal(
      mapGetOblicListingSocial({
        social: [
          {
            network: "whatsapp",
            url: "whatsapp://send?phone=15125550100",
          },
        ],
      }).whatsapp,
      "+15125550100",
    );
    const rejected = mapGetOblicListingSocial({
      whatsapp: "https://example.com/wa.me/15125550100",
      social: [{ network: "whatsapp", url: "https://wa.me/15125550199" }],
    });
    assert.equal(rejected.whatsapp, null);
    assert.equal(
      mapGetOblicListingSocial({ whatsapp: "abc" }).whatsapp,
      null,
    );
    assert.equal(
      mapGetOblicListingSocial({ whatsapp: "1234567" }).whatsapp,
      null,
    );
  });

  it("treats blank and non-string dedicated values as absent and honors length caps", () => {
    const longUrl = `https://facebook.com/${"a".repeat(600)}`;
    const mapped = mapGetOblicListingSocial({
      facebook: longUrl,
      instagram: "   ",
      linkedin: { url: "https://linkedin.com/company/acme" },
      whatsapp: `+${"1".repeat(40)}`,
      social: [{ network: "instagram", url: "https://instagram.com/acme" }],
    });
    assert.equal(mapped.facebook?.length, 500);
    assert.equal(mapped.facebook?.startsWith("https://facebook.com/"), true);
    assert.equal(mapped.instagram, "https://instagram.com/acme");
    assert.equal(mapped.linkedin, null);
    assert.equal(mapped.whatsapp, null);
    assert.equal(
      mapGetOblicListingSocial({
        facebook: "Acme page",
        whatsapp: "(512) 555-0100",
      }).facebook,
      "Acme page",
    );
    assert.equal(
      mapGetOblicListingSocial({ whatsapp: "(512) 555-0100" }).whatsapp,
      "(512) 555-0100",
    );
  });
});

describe("unclaimed acquisition social import", () => {
  it("fills empty social columns after insert without changing the RPC signature", async () => {
    const store = installStore([]);
    const calls = installRpc(store.rows);
    let reads = 0;
    const result = await acquireUnclaimedGetoblicDirectoryProspect(
      {
        organizationId: ORG,
        actorUserId: USER,
        wordpressListingId: LISTING_ID,
      },
      {
        getListingById: async (id) => {
          reads += 1;
          return listing({
            facebook: " https://facebook.com/acme ",
            instagram: "https://instagram.com/acme",
            linkedin: "https://linkedin.com/company/acme",
            whatsapp: "+1 (512) 555-0100",
          });
        },
      },
    );

    assert.deepEqual(result, { prospectId: PROSPECT, inserted: true });
    assert.equal(reads, 1);
    const acquire = calls.find(
      (call) => call.fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC,
    );
    assert.deepEqual(Object.keys(acquire?.args ?? {}), [...RPC_ARGS]);
    assert.deepEqual(
      store.updates.map((update) => Object.keys(update.patch)[0]),
      ["facebook", "instagram", "linkedin", "whatsapp_number"],
    );
    for (const update of store.updates) {
      const column = Object.keys(update.patch)[0];
      assert.equal(update.applied, true);
      assert.deepEqual(update.filters, {
        id: PROSPECT,
        organization_id: ORG,
      });
      assert.equal(
        update.or,
        `${column}.is.null,${column}.match."^[[:space:]]*$"`,
      );
    }
    assert.equal(store.rows[0].facebook, "https://facebook.com/acme");
    assert.equal(store.rows[0].instagram, "https://instagram.com/acme");
    assert.equal(store.rows[0].linkedin, "https://linkedin.com/company/acme");
    assert.equal(store.rows[0].whatsapp_number, "+1 (512) 555-0100");
    assert.equal(store.rows[0].user_id, USER);
    assert.equal(store.rows[0].source, "getoblic");
    assert.deepEqual(store.rows[0].raw_json, stamp());
  });

  it("reuses the same listing, fills blanks, and does not insert a duplicate", async () => {
    const kept = row({
      facebook: "https://facebook.com/user",
      instagram: "   ",
      linkedin: null,
      whatsapp_number: "+15550001111",
    });
    const foreign = row({
      id: OTHER_PROSPECT,
      organization_id: OTHER_ORG,
      facebook: null,
      instagram: null,
      linkedin: null,
      whatsapp_number: null,
    });
    const unrelated = row({
      id: UNRELATED,
      created_at: "2026-10-02T00:00:00.000Z",
      raw_json: stamp(4402),
      facebook: null,
      instagram: null,
      linkedin: null,
      whatsapp_number: null,
    });
    const store = installStore([kept, foreign, unrelated]);
    const calls = installRpc(store.rows, () => {
      throw new Error("duplicate insert");
    });
    let reads = 0;

    const result = await acquireUnclaimedGetoblicDirectoryProspect(
      {
        organizationId: `  ${ORG}  `,
        actorUserId: USER,
        wordpressListingId: LISTING_ID,
      },
      {
        getListingById: async () => {
          reads += 1;
          return listing({
            social: [
              { network: "facebook", url: "https://facebook.com/listing" },
              { network: "instagram", url: "https://www.instagram.com/listing" },
              { network: "linkedin", url: "https://www.linkedin.com/company/listing" },
              { network: "whatsapp", url: "https://wa.me/15125550100" },
              { network: "youtube", url: "https://youtube.com/@listing" },
            ],
          });
        },
      },
    );

    assert.deepEqual(result, { prospectId: PROSPECT, inserted: false });
    assert.equal(reads, 1);
    assert.equal(
      calls.some((call) => call.fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC),
      false,
    );
    assert.equal(store.rows.length, 3);
    assert.equal(kept.facebook, "https://facebook.com/user");
    assert.equal(kept.instagram, "https://www.instagram.com/listing");
    assert.equal(kept.linkedin, "https://www.linkedin.com/company/listing");
    assert.equal(kept.whatsapp_number, "+15550001111");
    assert.equal(kept.user_id, USER);
    assert.equal(foreign.facebook, null);
    assert.equal(foreign.instagram, null);
    assert.equal(unrelated.facebook, null);
    assert.equal(unrelated.linkedin, null);
    assert.deepEqual(
      store.updates.map((update) => ({
        column: Object.keys(update.patch)[0],
        applied: update.applied,
        id: update.filters.id,
        organizationId: update.filters.organization_id,
      })),
      [
        { column: "facebook", applied: false, id: PROSPECT, organizationId: ORG },
        { column: "instagram", applied: true, id: PROSPECT, organizationId: ORG },
        { column: "linkedin", applied: true, id: PROSPECT, organizationId: ORG },
        {
          column: "whatsapp_number",
          applied: false,
          id: PROSPECT,
          organizationId: ORG,
        },
      ],
    );
  });

  it("does not overwrite with empty listing values or update another organization", async () => {
    const kept = row({
      facebook: "https://facebook.com/user",
      whatsapp_number: "+15550001111",
    });
    const foreign = row({
      id: OTHER_PROSPECT,
      organization_id: OTHER_ORG,
    });
    const store = installStore([kept, foreign]);
    installRpc(store.rows);

    const result = await acquireUnclaimedGetoblicDirectoryProspect(
      {
        organizationId: ORG,
        actorUserId: USER,
        wordpressListingId: LISTING_ID,
      },
      {
        getListingById: async () =>
          listing({
            facebook: "   ",
            instagram: "",
            linkedin: null,
            whatsapp: "   ",
            social: [{ network: "youtube", url: "https://youtube.com/@acme" }],
          }),
      },
    );

    assert.deepEqual(result, { prospectId: PROSPECT, inserted: false });
    assert.equal(store.updates.length, 0);
    assert.equal(kept.facebook, "https://facebook.com/user");
    assert.equal(kept.whatsapp_number, "+15550001111");
    assert.equal(foreign.facebook, null);
    assert.equal(foreign.whatsapp_number, null);
  });

  it("keeps a concurrent nonempty edit and still fills the other empty columns", async () => {
    const kept = row();
    const foreign = row({
      id: OTHER_PROSPECT,
      organization_id: OTHER_ORG,
    });
    const store = installStore([kept, foreign], {
      beforeUpdate(patch, stored) {
        if (!("facebook" in patch)) return;
        const target = stored.find((candidate) => candidate.id === PROSPECT);
        if (target) target.facebook = "https://facebook.com/typed-during-update";
      },
    });
    installRpc(store.rows, () => {
      throw new Error("duplicate insert");
    });

    const result = await acquireSocial();

    assert.deepEqual(result, { prospectId: PROSPECT, inserted: false });
    assert.equal(kept.facebook, "https://facebook.com/typed-during-update");
    assert.equal(kept.instagram, "https://instagram.com/acme");
    assert.equal(kept.linkedin, "https://linkedin.com/company/acme");
    assert.equal(kept.whatsapp_number, "+1 (512) 555-0100");
    assert.equal(foreign.facebook, null);
    assert.equal(foreign.instagram, null);
    assert.equal(foreign.linkedin, null);
    assert.equal(foreign.whatsapp_number, null);
    assert.equal(
      store.updates.every(
        (update) =>
          update.filters.id === PROSPECT &&
          update.filters.organization_id === ORG &&
          update.applied !== ("facebook" in update.patch),
      ),
      true,
    );
  });

  it("retries a blank column once, then refuses success when it is still blank", async () => {
    const kept = row();
    const missed = installStore([kept], { outcomes: ["miss", "miss"] });
    installRpc(missed.rows, () => {
      throw new Error("duplicate insert");
    });

    await assert.rejects(() => acquireSocial(), conflict);
    assert.equal(kept.facebook, null);
    assert.equal(kept.instagram, null);
    assert.equal(missed.updates.length, 2);
    assert.equal(missed.updates.every((update) => update.applied), false);

    const recovered = installStore([kept], { outcomes: ["miss"] });
    const result = await acquireSocial();
    assert.deepEqual(result, { prospectId: PROSPECT, inserted: false });
    assert.equal(kept.facebook, "https://facebook.com/acme");
    assert.equal(kept.instagram, "https://instagram.com/acme");
    assert.equal(kept.linkedin, "https://linkedin.com/company/acme");
    assert.equal(kept.whatsapp_number, "+1 (512) 555-0100");
    assert.equal(recovered.updates[0].applied, false);
    assert.equal(recovered.updates[1].applied, true);
    assert.equal(Object.keys(recovered.updates[0].patch)[0], "facebook");
    assert.equal(Object.keys(recovered.updates[1].patch)[0], "facebook");
  });

  it("does not report success when persistence fails, and a later retry preserves newer values", async () => {
    const rows: StoreRow[] = [];
    const calls = installRpc(rows);
    installStore(rows, { outcomes: ["error", "error"] });

    await assert.rejects(() => acquireSocial(), conflict);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].facebook, null);
    assert.equal(rows[0].instagram, null);
    assert.equal(
      calls.filter((call) => call.fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC)
        .length,
      1,
    );

    rows[0].linkedin = "https://linkedin.com/in/user";
    const retried = installStore(rows);
    const result = await acquireSocial();

    assert.deepEqual(result, { prospectId: PROSPECT, inserted: false });
    assert.equal(rows.length, 1);
    assert.equal(
      calls.filter((call) => call.fn === ACQUIRE_UNCLAIMED_GETOBLIC_PROSPECT_RPC)
        .length,
      1,
    );
    assert.equal(rows[0].facebook, "https://facebook.com/acme");
    assert.equal(rows[0].instagram, "https://instagram.com/acme");
    assert.equal(rows[0].linkedin, "https://linkedin.com/in/user");
    assert.equal(rows[0].whatsapp_number, "+1 (512) 555-0100");
    assert.equal(
      retried.updates.find((update) => "linkedin" in update.patch)?.applied,
      false,
    );
  });

  it("does not report success when the fill response or confirmation is ambiguous", async () => {
    const ambiguous = row();
    installStore([ambiguous], { outcomes: ["ambiguous"] });
    installRpc([ambiguous], () => {
      throw new Error("duplicate insert");
    });
    await assert.rejects(() => acquireSocial(), conflict);
    assert.equal(ambiguous.facebook, null);
    assert.equal(ambiguous.instagram, null);

    const unconfirmed = row();
    const store = installStore([unconfirmed], {
      outcomes: ["miss"],
      confirmationErrors: 1,
    });
    installRpc([unconfirmed], () => {
      throw new Error("duplicate insert");
    });
    await assert.rejects(() => acquireSocial(), conflict);
    assert.equal(store.updates.length, 1);
    assert.equal(unconfirmed.facebook, null);
    assert.equal(unconfirmed.instagram, null);
  });

  it("does not report success when the scoped prospect disappears during the fill", async () => {
    const kept = row();
    installStore([kept], {
      beforeUpdate(_patch, stored) {
        stored.splice(0, stored.length);
      },
    });
    installRpc([kept], () => {
      throw new Error("duplicate insert");
    });

    await assert.rejects(() => acquireSocial(), conflict);
    assert.equal(kept.facebook, null);
  });

  it("puts the empty-column predicate in the update filter", () => {
    const query = new PostgrestQueryBuilder(
      new URL("http://localhost/prospects"),
      { headers: {} },
    );
    const pending = query
      .update({ facebook: "https://facebook.com/acme" })
      .eq("id", PROSPECT)
      .eq("organization_id", ORG)
      .or('facebook.is.null,facebook.match."^[[:space:]]*$"')
      .select("id");
    const params = (pending as unknown as { url: URL }).url.searchParams;
    assert.equal(params.get("id"), `eq.${PROSPECT}`);
    assert.equal(params.get("organization_id"), `eq.${ORG}`);
    assert.equal(
      params.get("or"),
      '(facebook.is.null,facebook.match."^[[:space:]]*$")',
    );
    assert.equal(params.has("facebook"), false);
  });

  it("does not read listing detail for an unauthorized organization or an invalid id", async () => {
    let reads = 0;
    const getListingById = async () => {
      reads += 1;
      return listing();
    };
    await assert.rejects(
      () =>
        acquireUnclaimedGetoblicDirectoryProspect(
          {
            organizationId: ORG,
            actorUserId: USER,
            wordpressListingId: LISTING_ID,
          },
          {
            resolveMode: async () => "ordinary",
            getListingById,
            acquire: async () => {
              throw new Error("rpc");
            },
          },
        ),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_UNCLAIMED_PROSPECTING_NOT_AUTHORIZED",
    );
    await assert.rejects(
      () =>
        acquireUnclaimedGetoblicDirectoryProspect(
          {
            organizationId: ORG,
            actorUserId: USER,
            wordpressListingId: 0,
          },
          {
            resolveMode: async () => "unclaimed",
            getListingById,
            acquire: async () => {
              throw new Error("rpc");
            },
          },
        ),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
    );
    assert.equal(reads, 0);
  });

  it("keeps the existing acquire_unclaimed_getoblic_prospect signature", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261011000001_allow_unclaimed_getoblic_prospects.sql",
      ),
      "utf8",
    );
    const start = migration.indexOf(
      "create or replace function public.acquire_unclaimed_getoblic_prospect",
    );
    const end = migration.indexOf("returns table", start);
    const signature = migration.slice(start, end);
    assert.match(signature, /p_google_business_url text default null/);
    assert.doesNotMatch(signature, /facebook|instagram|linkedin|whatsapp/);
  });
});
