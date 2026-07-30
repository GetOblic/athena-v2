import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parsePersonaCsvDocument,
  PERSONA_CSV_MAX_DATA_ROWS,
  validatePersonaCsvDataRowLimit,
} from "../../services/personas/personaCsv";
import {
  buildPersonaImportPreviewPayload,
  preparePersonaImportRows,
  PERSONA_IMPORT_PREVIEW_ROW_LIMIT,
} from "../../services/personas/personaImportPreparation";

const ROOT = join(process.cwd());

function stubPersona(partial: {
  id: string;
  reference_website?: string | null;
  persona_name?: string | null;
  city?: string | null;
}) {
  return {
    id: partial.id,
    organization_id: "org-a",
    reference_website: partial.reference_website ?? null,
    persona_name: partial.persona_name ?? null,
    city: partial.city ?? null,
  } as never;
}

describe("persona CSV template and headers", () => {
  it("ships canonical Persona CSV template headers", () => {
    const template = readFileSync(
      join(ROOT, "public/templates/athena-persona-import-template.csv"),
      "utf8",
    );
    const header = template.split(/\r?\n/)[0];
    for (const column of [
      "Persona Name",
      "Short Description",
      "Category",
      "Gender Identity",
      "Age Range",
      "Birth Year",
      "Reference Website",
      "Notes",
      "Additional Context",
      "Ads Content",
      "Source",
    ]) {
      assert.match(header, new RegExp(column));
    }
  });
});

describe("persona CSV parsing", () => {
  it("accepts practical aliases", () => {
    const document = parsePersonaCsvDocument(
      [
        "name,description,website,context,ads,age,language,income,assets,pain_points,channels",
        "Urban Seeker,Short summary,example.com,Deep notes,Ad copy,30-45,English,$80k,Moderate,Time scarcity,Email",
      ].join("\n"),
    );

    assert.equal(document.parseFailure, false);
    assert.equal(document.rows[0].persona_name, "Urban Seeker");
    assert.equal(document.rows[0].short_description, "Short summary");
    assert.equal(document.rows[0].reference_website, "example.com");
    assert.equal(document.rows[0].additional_context, "Deep notes");
    assert.equal(document.rows[0].ads_content, "Ad copy");
    assert.equal(document.rows[0].age_range, "30-45");
    assert.equal(document.rows[0].languages, "English");
    assert.equal(document.rows[0].income_range, "$80k");
    assert.equal(document.rows[0].purchasing_power, "Moderate");
    assert.equal(document.rows[0].pain_points, "Time scarcity");
    assert.equal(document.rows[0].preferred_channels, "Email");
  });

  it("parses multiline Additional Context", () => {
    const document = parsePersonaCsvDocument(
      [
        "Persona Name,Additional Context",
        'Seeker,"Line one',
        "Line two",
        'Line three"',
      ].join("\n"),
    );

    assert.equal(document.records.length, 1);
    assert.equal(
      document.rows[0].additional_context,
      "Line one\nLine two\nLine three",
    );
    assert.equal(document.records[0].sourceRowNumber, 2);
  });

  it("allows optional demographics and rejects blank rows", async () => {
    const batch = await preparePersonaImportRows({
      organizationId: "org-a",
      rows: [
        { additional_context: "Context only is enough" },
        { persona_name: "", short_description: "", notes: "" },
        { persona_name: "Named", age_range: null, income_range: null },
      ],
      findDuplicate: async () => null,
    });

    assert.equal(batch.rows[0].status, "ready");
    assert.equal(batch.rows[0].importable, true);
    assert.equal(batch.rows[1].status, "invalid");
    assert.equal(batch.rows[1].reason, "Blank row");
    assert.equal(batch.rows[2].status, "ready");
  });

  it("warns and keeps invalid Reference Website importable", async () => {
    const batch = await preparePersonaImportRows({
      organizationId: "org-a",
      rows: [{ reference_website: "not a url!!!" }],
      findDuplicate: async () => null,
    });

    assert.equal(batch.rows[0].status, "warning");
    assert.equal(batch.rows[0].importable, true);
    assert.match(
      batch.rows[0].warnings[0] ?? "",
      /Reference Website could not be normalized/,
    );
  });

  it("hard-skips duplicate Reference Website and name+city", async () => {
    const batch = await preparePersonaImportRows({
      organizationId: "org-a",
      rows: [
        { persona_name: "A", reference_website: "https://example.com" },
        { persona_name: "B", reference_website: "https://example.com" },
        { persona_name: "Twin", city: "Austin" },
        { persona_name: "Twin", city: "Austin" },
      ],
      findDuplicate: async (_org, website, name, city) => {
        if (website === "https://example.com") {
          return stubPersona({
            id: "db-1",
            reference_website: "https://example.com",
          });
        }
        if (name === "Twin" && city === "Austin") {
          return stubPersona({
            id: "db-2",
            persona_name: "Twin",
            city: "Austin",
          });
        }
        return null;
      },
    });

    // First website row is DB duplicate; second file duplicate.
    assert.equal(batch.rows[0].status, "duplicate");
    assert.match(batch.rows[0].reason ?? "", /Duplicate Reference Website/);
    assert.equal(batch.rows[1].status, "duplicate");
    assert.equal(batch.rows[2].status, "duplicate");
    assert.match(batch.rows[2].reason ?? "", /Duplicate Persona Name and City/);
  });

  it("warns on context-only likely duplicates but keeps them importable", async () => {
    const context =
      "A long additional context string that is similar enough to look like a duplicate in-file match for operators.";
    const batch = await preparePersonaImportRows({
      organizationId: "org-a",
      rows: [
        { additional_context: context },
        { additional_context: context },
      ],
      findDuplicate: async () => null,
    });

    assert.equal(batch.rows[0].status, "ready");
    assert.equal(batch.rows[0].importable, true);
    assert.equal(batch.rows[1].status, "warning");
    assert.equal(batch.rows[1].importable, true);
    assert.match(
      batch.rows[1].warnings[0] ?? "",
      /Possible context-only duplicate/,
    );
  });

  it("enforces 500 row max and 20 preview display cap", () => {
    assert.equal(PERSONA_CSV_MAX_DATA_ROWS, 500);
    assert.equal(PERSONA_IMPORT_PREVIEW_ROW_LIMIT, 20);

    const over = validatePersonaCsvDataRowLimit(501);
    assert.equal(over.ok, false);

    const ok = validatePersonaCsvDataRowLimit(500);
    assert.equal(ok.ok, true);

    const preview = buildPersonaImportPreviewPayload({
      batch: {
        totalRows: 25,
        importableRows: 25,
        duplicateRows: 0,
        invalidRows: 0,
        warningRows: 0,
        rows: Array.from({ length: 25 }, (_, index) => ({
          rowNumber: index + 2,
          row: { persona_name: `P${index}` },
          personaName: `P${index}`,
          displayLabel: `P${index}`,
          referenceWebsiteInput: null,
          normalizedReferenceWebsite: null,
          invalidReferenceWebsite: false,
          city: null,
          category: null,
          status: "ready" as const,
          warnings: [],
          reason: null,
          importable: true,
          duplicateSource: null,
        })),
      },
      recognizedColumns: ["persona_name"],
      ignoredColumns: [],
    });

    assert.equal(preview.displayedRows, 20);
    assert.equal(preview.showingSubset, true);
  });
});

describe("persona CSV import persistence containment", () => {
  it("importer persists rows and reports queue outcomes separately", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    const importerSource = readFileSync(
      join(ROOT, "services/personas/personaImporter.ts"),
      "utf8",
    );
    // Stage 3: durable enqueue is active; still no Deep Scrape / sync generation.
    assert.match(importerSource, /ensurePersonaGenerationQueued/);
    assert.doesNotMatch(importerSource, /["']persona_deep_scrape["']/);
    assert.doesNotMatch(importerSource, /processDiscussionEndToEnd/);

    const { importPersonasFromRows } = await import(
      "../../services/personas/personaImporter"
    );

    const created: string[] = [];
    const summary = await importPersonasFromRows({
      organizationId: "org-a",
      userId: "user-a",
      rows: [
        { persona_name: "Ready One" },
        { persona_name: "", notes: "" },
        { additional_context: "Importable context" },
      ],
      findDuplicate: async () => null,
      createPersona: async (input) => {
        created.push(String(input.persona_name ?? input.additional_context));
        return {
          id: `id-${created.length}`,
          organization_id: input.organization_id,
        } as never;
      },
      ensureQueued: async (persona) => ({
        persona: persona as never,
        queued: true,
        jobId: "job-test",
      }),
    });

    assert.equal(summary.imported, 2);
    assert.equal(summary.queued, 2);
    assert.equal(summary.queueFailed, 0);
    assert.equal(summary.invalidRows, 1);
    assert.equal(summary.failed, 0);
    assert.equal(created.length, 2);
    assert.ok(summary.batchId);
  });
});
