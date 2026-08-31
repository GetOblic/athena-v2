import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parseProspectCsv,
  parseProspectCsvDocument,
  PROSPECT_CSV_MAX_DATA_ROWS,
  validateProspectCsvDataRowLimit,
} from "../../services/prospects/prospectCsv";
import {
  buildProspectImportPreviewPayload,
  prepareProspectImportRows,
  PROSPECT_IMPORT_PREVIEW_ROW_LIMIT,
} from "../../services/prospects/prospectImportPreparation";
import {
  formatNormalizedProspectInputForPipeline,
  normalizeProspectExecutiveInput,
} from "../../services/prospects/prospectNormalization";
import {
  resolveProspectBusinessName,
  resolveProspectDecisionMaker,
} from "../../services/prospects/prospectUtils";

const ROOT = join(process.cwd());

async function loadImporter() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  return import("../../services/prospects/prospectImporter");
}

function stubProspect(partial: {
  id: string;
  organization_id?: string;
  business_name?: string;
  website?: string | null;
  city?: string | null;
}) {
  return {
    id: partial.id,
    organization_id: partial.organization_id ?? "org-a",
    business_name: partial.business_name ?? "Existing",
    website: partial.website ?? null,
    city: partial.city ?? null,
  } as never;
}

describe("prospect CSV multiline and source row parsing", () => {
  it("parses quoted multiline Notes as one data row", () => {
    const document = parseProspectCsvDocument(
      [
        "Business Name,Notes",
        'Example Clinic,"Line one',
        "Line two",
        'Line three"',
      ].join("\n"),
    );

    assert.equal(document.parseFailure, false);
    assert.equal(document.records.length, 1);
    assert.equal(document.rows[0].business_name, "Example Clinic");
    assert.equal(document.rows[0].notes, "Line one\nLine two\nLine three");
    assert.equal(document.records[0].sourceRowNumber, 2);
  });

  it("parses quoted multiline Ads Content as one data row", () => {
    const document = parseProspectCsvDocument(
      [
        "Business Name,Ads Content",
        'Example Clinic,"Headline one',
        "Headline two",
        'Call today"',
      ].join("\n"),
    );

    assert.equal(document.records.length, 1);
    assert.equal(
      document.rows[0].ads_content,
      "Headline one\nHeadline two\nCall today",
    );
  });

  it("preserves escaped quotes inside multiline content", () => {
    const document = parseProspectCsvDocument(
      [
        "business_name,notes",
        '"Clinic ""One""","She said ""hello""',
        'and left"',
      ].join("\n"),
    );

    assert.equal(document.rows[0].business_name, 'Clinic "One"');
    assert.equal(document.rows[0].notes, 'She said "hello"\nand left');
  });

  it("rejects unclosed quoted fields", () => {
    const document = parseProspectCsvDocument(
      'business_name,notes\nAcme,"still open forever\n',
    );
    assert.equal(document.parseFailure, true);
    assert.match(document.parseFailureReason ?? "", /unclosed quoted field/i);
    assert.equal(document.records.length, 0);
  });

  it("preserves physical source row numbers across blank lines", () => {
    const document = parseProspectCsvDocument(
      [
        "business_name,website",
        "First,first.com",
        "",
        "Second,second.com",
      ].join("\n"),
    );

    assert.equal(document.records.length, 2);
    assert.equal(document.records[0].sourceRowNumber, 2);
    assert.equal(document.records[1].sourceRowNumber, 4);
  });

  it("uses the starting physical line for multiline records", () => {
    const document = parseProspectCsvDocument(
      [
        "business_name,ads_content",
        'Acme,"one',
        "two",
        'three"',
        "Beta,beta.com",
      ].join("\n"),
    );

    assert.equal(document.records.length, 2);
    assert.equal(document.records[0].sourceRowNumber, 2);
    assert.equal(document.records[1].sourceRowNumber, 5);
  });

  it("strips UTF-8 BOM and preserves quoted commas", () => {
    const rows = parseProspectCsv(
      '\uFEFFbusiness_name,notes\n"Example Clinic","Hello, world"\n',
    );
    assert.equal(rows[0].business_name, "Example Clinic");
    assert.equal(rows[0].notes, "Hello, world");
  });

  it("maps canonical and friendly headers with aliases", () => {
    const document = parseProspectCsvDocument(
      [
        "Business Name,Website,LinkedIn URL,contact,title,Employees,Ads Content,mystery_col",
        "Acme,acme.com,https://linkedin.com/in/a,Jane,CEO,12,Spring promo,ignore-me",
      ].join("\n"),
    );

    assert.ok(document.recognizedColumns.includes("business_name"));
    assert.ok(document.recognizedColumns.includes("ads_content"));
    assert.deepEqual(document.ignoredColumns, ["mystery_col"]);
    assert.equal(document.rows[0].decision_maker, "Jane");
    assert.equal(document.delimiterFailure, false);
  });

  it("flags obvious semicolon-delimited header failures", () => {
    const document = parseProspectCsvDocument(
      "business_name;website;city\nAcme;acme.com;Austin\n",
    );
    assert.equal(document.delimiterFailure, true);
    assert.match(document.delimiterFailureReason ?? "", /semicolon/i);
  });

  it("parseProspectCsv remains a compatibility wrapper", () => {
    const text = "company_name,url\nBeta,beta.com\n";
    assert.deepEqual(parseProspectCsv(text), parseProspectCsvDocument(text).rows);
  });

  it("Athena template parses with quoted commas and no ignored columns", () => {
    const text = readFileSync(
      join(ROOT, "public/templates/athena-prospect-import-template.csv"),
      "utf8",
    );
    const document = parseProspectCsvDocument(text);
    assert.equal(document.parseFailure, false);
    assert.equal(document.delimiterFailure, false);
    assert.equal(document.records.length, 1);
    assert.ok(document.records.length <= PROSPECT_CSV_MAX_DATA_ROWS);
    assert.equal(document.ignoredColumns.length, 0);
    assert.equal(document.rows[0].business_name, "Example Aesthetics Clinic");
    assert.equal(document.rows[0].address, "123 Lake Shore Drive, Suite 400");
    assert.equal(document.rows[0].first_name, "Jordan");
    assert.equal(document.rows[0].last_name, "Taylor");
    assert.equal(document.rows[0].external_contact_id, "CRM-10042");
    assert.equal(document.rows[0].timezone, "America/Chicago");
    assert.match(document.rows[0].technologies ?? "", /injectables/);
  });

  it("maps CRM-friendly headers into new and existing fields", () => {
    const document = parseProspectCsvDocument(
      [
        "Contact Id,First Name,Last Name,Street Address,Timezone,Google_Url,Business Name",
        "CRM-9,Alex,Rivera,100 Main St,America/Chicago,https://maps.example.com/a,Rivera Clinic",
      ].join("\n"),
    );

    assert.equal(document.ignoredColumns.length, 0);
    assert.equal(document.rows[0].external_contact_id, "CRM-9");
    assert.equal(document.rows[0].first_name, "Alex");
    assert.equal(document.rows[0].last_name, "Rivera");
    assert.equal(document.rows[0].address, "100 Main St");
    assert.equal(document.rows[0].timezone, "America/Chicago");
    assert.equal(
      document.rows[0].google_business_url,
      "https://maps.example.com/a",
    );
  });

  it("still maps canonical snake_case CRM headers", () => {
    const rows = parseProspectCsv(
      "business_name,external_contact_id,first_name,last_name,timezone,google_url\nAcme,EXT-1,Pat,Lee,UTC,https://maps.example.com/b\n",
    );
    assert.equal(rows[0].external_contact_id, "EXT-1");
    assert.equal(rows[0].first_name, "Pat");
    assert.equal(rows[0].last_name, "Lee");
    assert.equal(rows[0].timezone, "UTC");
    assert.equal(rows[0].google_business_url, "https://maps.example.com/b");
  });
});

describe("prospect contact name resolution", () => {
  it("keeps explicit decision_maker and derives first/last fallbacks", () => {
    assert.equal(
      resolveProspectDecisionMaker({
        decision_maker: "Explicit Name",
        first_name: "A",
        last_name: "B",
      }),
      "Explicit Name",
    );
    assert.equal(
      resolveProspectDecisionMaker({
        decision_maker: "",
        first_name: "Jordan",
        last_name: "Taylor",
      }),
      "Jordan Taylor",
    );
    assert.equal(
      resolveProspectDecisionMaker({
        decision_maker: "",
        first_name: "Jordan",
        last_name: "",
      }),
      "Jordan",
    );
    assert.equal(
      resolveProspectDecisionMaker({
        decision_maker: "",
        first_name: "",
        last_name: "Taylor",
      }),
      "Taylor",
    );
    assert.equal(
      resolveProspectBusinessName({
        business_name: "Clinic",
        first_name: "Jordan",
        last_name: "Taylor",
      }),
      "Clinic",
    );
    assert.equal(
      resolveProspectBusinessName({
        business_name: "",
        website: "",
        first_name: "Jordan",
        last_name: "Taylor",
      }),
      "Jordan Taylor",
    );
  });

  it("includes first name, last name, and timezone in generation context without CRM id", () => {
    const body = formatNormalizedProspectInputForPipeline(
      normalizeProspectExecutiveInput({
        business_name: "Acme",
        website: null,
        linkedin: null,
        facebook: null,
        instagram: null,
        industry: null,
        category: null,
        country: null,
        state: null,
        city: null,
        address: null,
        company_size: null,
        revenue: null,
        employee_count: null,
        technologies: null,
        pain_points: null,
        decision_maker: "Pat Lee",
        first_name: "Pat",
        last_name: "Lee",
        timezone: "America/Chicago",
        job_title: null,
        email: null,
        phone: null,
        google_business_url: null,
        notes: null,
        additional_context: null,
        ads_content: null,
        source: "csv",
        website_intelligence: null,
      }),
    );

    assert.match(body, /Contact First Name: Pat/);
    assert.match(body, /Contact Last Name: Lee/);
    assert.match(body, /Timezone: America\/Chicago/);
    assert.doesNotMatch(body, /CRM-|external_contact/i);
  });
});

describe("prospect CSV maximum data rows", () => {
  it("accepts exactly 500 data rows and rejects 501", () => {
    assert.equal(PROSPECT_CSV_MAX_DATA_ROWS, 500);
    assert.equal(validateProspectCsvDataRowLimit(500).ok, true);
    const rejected = validateProspectCsvDataRowLimit(501);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.match(rejected.message, /501 data rows/);
      assert.match(rejected.message, /maximum of 500/);
    }
  });

  it("preview and final import routes share the same maximum helper", () => {
    const preview = readFileSync(
      join(ROOT, "app/api/prospects/import/preview/route.ts"),
      "utf8",
    );
    const finalImport = readFileSync(
      join(ROOT, "app/api/prospects/import/route.ts"),
      "utf8",
    );
    assert.match(preview, /validateProspectCsvDataRowLimit/);
    assert.match(finalImport, /validateProspectCsvDataRowLimit/);
    assert.match(preview, /PROSPECT_CSV_MAX_DATA_ROWS|validateProspectCsvDataRowLimit/);
  });
});

describe("shared prospect import preparation", () => {
  it("uses parser-provided source row numbers", async () => {
    const batch = await prepareProspectImportRows({
      organizationId: "org-a",
      findDuplicate: async () => null,
      records: [
        {
          sourceRowNumber: 2,
          fields: { business_name: "First", website: "first.com" },
        },
        {
          sourceRowNumber: 7,
          fields: { business_name: "", website: "", decision_maker: "" },
        },
      ],
    });

    assert.equal(batch.rows[0].rowNumber, 2);
    assert.equal(batch.rows[1].rowNumber, 7);
    assert.equal(batch.rows[1].status, "invalid");
  });

  it("does not call the duplicate finder for invalid rows", async () => {
    let calls = 0;
    await prepareProspectImportRows({
      organizationId: "org-a",
      findDuplicate: async () => {
        calls += 1;
        return null;
      },
      records: [
        {
          sourceRowNumber: 2,
          fields: { business_name: "", website: "", decision_maker: "" },
        },
        {
          sourceRowNumber: 3,
          fields: { business_name: "Valid", website: "valid.com" },
        },
      ],
    });

    assert.equal(calls, 1);
  });

  it("marks later in-file duplicates deterministically and passes organization ID", async () => {
    const organizations: string[] = [];
    const batch = await prepareProspectImportRows({
      organizationId: "org-scoped",
      findDuplicate: async (organizationId) => {
        organizations.push(organizationId);
        return null;
      },
      records: [
        {
          sourceRowNumber: 2,
          fields: { business_name: "Twin", website: "twin.com" },
        },
        {
          sourceRowNumber: 3,
          fields: { business_name: "Twin", website: "twin.com" },
        },
      ],
    });

    assert.equal(batch.rows[0].status, "ready");
    assert.equal(batch.rows[1].status, "duplicate");
    assert.equal(batch.rows[1].duplicateSource, "file");
    assert.deepEqual(organizations, ["org-scoped"]);
  });

  it("propagates duplicate finder failures instead of inventing a valid preview", async () => {
    await assert.rejects(
      () =>
        prepareProspectImportRows({
          organizationId: "org-a",
          findDuplicate: async () => {
            throw new Error("duplicate lookup failed");
          },
          records: [
            {
              sourceRowNumber: 2,
              fields: { business_name: "Acme", website: "acme.com" },
            },
          ],
        }),
      /duplicate lookup failed/,
    );
  });

  it("classifies valid, missing-website warning, invalid website, and invalid rows", async () => {
    const batch = await prepareProspectImportRows({
      organizationId: "org-a",
      findDuplicate: async () => null,
      rows: [
        {
          business_name: "Ready Co",
          website: "ready.com",
          decision_maker: "Pat",
          industry: "SaaS",
          city: "Austin",
          email: "pat@ready.com",
        },
        {
          business_name: "No Site Co",
          website: "",
          city: "Dallas",
        },
        {
          business_name: "Bad Site Co",
          website: "not a website",
          city: "Houston",
        },
        {
          business_name: "",
          website: "",
          decision_maker: "",
        },
      ],
    });

    assert.equal(batch.importableRows, 3);
    assert.equal(batch.invalidRows, 1);
    assert.equal(batch.invalidWebsiteRows, 1);
    assert.equal(batch.rows[0].status, "ready");
    assert.equal(batch.rows[2].websiteToPersist, null);
    assert.equal(batch.rows[2].importable, true);
  });

  it("detects database duplicates with organization-scoped finder args", async () => {
    const batch = await prepareProspectImportRows({
      organizationId: "org-a",
      findDuplicate: async (organizationId, website, businessName) => {
        if (website === "https://existing.com") {
          return stubProspect({
            id: "p1",
            organization_id: organizationId,
            website,
            business_name: businessName,
          });
        }
        return null;
      },
      rows: [
        { business_name: "Existing Co", website: "existing.com", city: "Austin" },
        { business_name: "Fresh Co", website: "fresh.com", city: "Austin" },
      ],
    });

    assert.equal(batch.duplicateRows, 1);
    assert.equal(batch.rows[0].duplicateSource, "database");
    assert.equal(batch.rows[1].status, "ready");
  });

  it("calculates aggregates across the full file while bounding preview rows", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      business_name: `Company ${index + 1}`,
      website: `company${index + 1}.com`,
    }));

    const batch = await prepareProspectImportRows({
      organizationId: "org-a",
      findDuplicate: async () => null,
      rows,
    });

    const preview = buildProspectImportPreviewPayload({
      batch,
      recognizedColumns: ["business_name", "website"],
      ignoredColumns: ["extra"],
    });

    assert.equal(preview.totalRows, 25);
    assert.equal(preview.displayedRows, PROSPECT_IMPORT_PREVIEW_ROW_LIMIT);
    assert.equal(preview.showingSubset, true);
  });
});

describe("final prospect CSV import behavior", () => {
  it("preserves source row numbers, persists valid rows, skips duplicates, and queues without scraping", async () => {
    const { importProspectsFromRows } = await loadImporter();
    const persisted: Array<{
      business_name: string;
      website: string | null;
      raw_json: unknown;
    }> = [];
    const queued: string[] = [];

    const summary = await importProspectsFromRows({
      organizationId: "org-a",
      userId: "user-1",
      findDuplicate: async (_organizationId, website) => {
        if (website === "https://dup.com") {
          return stubProspect({ id: "existing", website });
        }
        return null;
      },
      createProspect: async (input) => {
        persisted.push({
          business_name: input.business_name,
          website: (input.website as string | null) ?? null,
          raw_json: input.raw_json ?? null,
        });
        return stubProspect({
          id: `created-${persisted.length}`,
          business_name: input.business_name,
          website: (input.website as string | null) ?? null,
        });
      },
      ensureQueued: async (prospect) => {
        queued.push(prospect.id);
        return { prospect, queued: true, jobId: `job-${prospect.id}` };
      },
      records: [
        {
          sourceRowNumber: 2,
          fields: { business_name: "Ready", website: "ready.com" },
        },
        {
          sourceRowNumber: 4,
          fields: { business_name: "Dup", website: "dup.com" },
        },
        {
          sourceRowNumber: 6,
          fields: { business_name: "Broken Site", website: "not a website" },
        },
        {
          sourceRowNumber: 9,
          fields: { business_name: "", website: "", decision_maker: "" },
        },
      ],
    });

    assert.equal(summary.imported, 2);
    assert.equal(summary.duplicates, 1);
    assert.equal(summary.invalidRows, 1);
    assert.equal(summary.invalidWebsites, 1);
    assert.equal(summary.queued, 2);
    assert.equal(summary.withoutWebsite, 1);
    assert.deepEqual(
      summary.invalidRowDetails.map((row) => row.rowNumber),
      [9],
    );
    assert.equal(persisted[0].website, "https://ready.com");
    assert.equal(persisted[1].website, null);
    assert.deepEqual(persisted[1].raw_json, {
      invalid_website_input: "not a website",
    });
    assert.equal(queued.length, 2);
  });

  it("preserves CRM fields through preparation and final import without using external_contact_id as a duplicate key", async () => {
    const { importProspectsFromRows } = await loadImporter();
    const persisted: Array<Record<string, unknown>> = [];

    const prepared = await prepareProspectImportRows({
      organizationId: "org-a",
      findDuplicate: async () => null,
      records: [
        {
          sourceRowNumber: 2,
          fields: {
            business_name: "Clinic A",
            website: "clinica.com",
            first_name: "Sam",
            last_name: "Lee",
            external_contact_id: "CRM-1",
            timezone: "America/Chicago",
            address: "1 Main",
          },
        },
        {
          sourceRowNumber: 3,
          fields: {
            business_name: "Clinic B",
            website: "clinicb.com",
            external_contact_id: "CRM-1",
            first_name: "Other",
            last_name: "Person",
          },
        },
      ],
    });

    assert.equal(prepared.importableRows, 2);
    assert.equal(prepared.duplicateRows, 0);
    assert.equal(prepared.rows[0].decisionMaker, "Sam Lee");

    const summary = await importProspectsFromRows({
      organizationId: "org-a",
      userId: "user-1",
      findDuplicate: async () => null,
      createProspect: async (input) => {
        persisted.push({
          first_name: input.first_name ?? null,
          last_name: input.last_name ?? null,
          external_contact_id: input.external_contact_id ?? null,
          timezone: input.timezone ?? null,
          decision_maker: input.decision_maker ?? null,
        });
        return stubProspect({
          id: `p-${persisted.length}`,
          business_name: input.business_name,
          website: (input.website as string | null) ?? null,
        });
      },
      ensureQueued: async (prospect) => ({
        prospect,
        queued: true,
        jobId: `job-${prospect.id}`,
      }),
      records: [
        {
          sourceRowNumber: 2,
          fields: {
            business_name: "Clinic A",
            website: "clinica.com",
            first_name: "Sam",
            last_name: "Lee",
            external_contact_id: "CRM-1",
            timezone: "America/Chicago",
          },
        },
      ],
    });

    assert.equal(summary.imported, 1);
    assert.equal(persisted[0].first_name, "Sam");
    assert.equal(persisted[0].last_name, "Lee");
    assert.equal(persisted[0].external_contact_id, "CRM-1");
    assert.equal(persisted[0].timezone, "America/Chicago");
    assert.equal(persisted[0].decision_maker, "Sam Lee");
  });

  it("HTTP import path contracts still avoid scrape and AI work", () => {
    const importer = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const importFn = importer.slice(
      importer.indexOf("export async function importProspectsFromRows"),
    );
    assert.match(importFn, /prepareProspectImportRows/);
    assert.doesNotMatch(importFn, /scrapeHomepageIntelligence/);
    assert.doesNotMatch(importFn, /processDiscussionEndToEnd|openai|anthropic/i);

    const route = readFileSync(
      join(ROOT, "app/api/prospects/import/route.ts"),
      "utf8",
    );
    assert.match(route, /validateProspectCsvDataRowLimit/);
    assert.match(route, /records: document\.records/);
  });
});

describe("prospect CSV UI extraction contracts", () => {
  it("parent renders extracted CSV component and retains Manual Import", () => {
    const parent = readFileSync(
      join(ROOT, "components/prospects/ProspectImportForms.tsx"),
      "utf8",
    );
    const csv = readFileSync(
      join(ROOT, "components/prospects/ProspectCsvImport.tsx"),
      "utf8",
    );

    assert.match(parent, /ProspectCsvImport/);
    assert.match(parent, /copy\.manualTitle/);
    assert.match(parent, /External Contact ID/);
    assert.match(parent, /First Name/);
    assert.match(parent, /Last Name/);
    assert.match(parent, /Timezone/);
    assert.doesNotMatch(parent, /copy\.reviewCta/);
    assert.match(csv, /copy\.downloadTemplate/);
    assert.match(csv, /download="Athena_Prospect_Import_Template\.csv"/);
    assert.match(csv, /copy\.reviewCta/);
    assert.match(csv, /copy\.recognizedLabel/);
    assert.match(csv, /copy\.ignoredLabel/);
    assert.match(csv, /copy\.warnings/);
    assert.match(csv, /preview\.ignoredColumns\.length > 0/);
    assert.match(csv, /copy\.guideMaxRows/);
    assert.match(csv, /copy\.openLibrary/);
    assert.doesNotMatch(csv, />Import CSV</);
  });

  it("metadata editor and API routes accept CRM contact fields", () => {
    const editor = readFileSync(
      join(ROOT, "components/prospects/ProspectMetadataEditor.tsx"),
      "utf8",
    );
    const createRoute = readFileSync(
      join(ROOT, "app/api/prospects/route.ts"),
      "utf8",
    );
    const updateRoute = readFileSync(
      join(ROOT, "app/api/prospects/[id]/route.ts"),
      "utf8",
    );
    const normalization = readFileSync(
      join(ROOT, "services/prospects/prospectNormalization.ts"),
      "utf8",
    );

    assert.match(editor, /External Contact ID/);
    assert.match(editor, /OPTIONAL_DISPLAY_FIELDS/);
    assert.match(createRoute, /external_contact_id/);
    assert.match(createRoute, /first_name/);
    assert.match(updateRoute, /external_contact_id/);
    assert.match(normalization, /Contact First Name/);
    assert.match(normalization, /Contact Last Name/);
    assert.match(normalization, /Timezone:/);
    assert.doesNotMatch(normalization, /external_contact_id|External Contact/);
  });

  it("preview route authenticates and never writes", () => {
    const route = readFileSync(
      join(ROOT, "app/api/prospects/import/preview/route.ts"),
      "utf8",
    );
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /validateProspectCsvDataRowLimit/);
    assert.match(route, /mode: "preview"/);
    assert.doesNotMatch(
      route,
      /createProspect|importProspectsFromRows|enqueueDiscussionGenerationJob|scrapeHomepageIntelligence/,
    );
  });
});
