import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isProspectGetOblicType,
  normalizeOptionalProspectGetOblicType,
  PROSPECT_GETOBLIC_TYPES,
} from "../../services/prospects/prospectGetOblicType";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("V6 Sprint 1 — Prospect GetOblic Type", () => {
  it("migration adds nullable getoblic_type without backfill", () => {
    const migration = read(
      "supabase/migrations/20260721000001_add_prospect_getoblic_type.sql",
    );
    assert.match(migration, /alter table prospects/i);
    assert.match(migration, /getoblic_type text/);
    assert.doesNotMatch(migration, /update\s+prospects/i);
    assert.doesNotMatch(migration, /set\s+getoblic_type/i);
    assert.doesNotMatch(migration, /drop column/i);
  });

  it("allowlist stores exactly the required values", () => {
    assert.deepEqual([...PROSPECT_GETOBLIC_TYPES], [
      "small-business",
      "pet_grooming",
      "tattoo-parlors",
      "chiropractor",
      "nail-salons",
      "health-wellness",
      "pet_services",
      "hair-salons",
      "massages",
      "barbershop",
      "real-estate",
      "esotericism",
      "podcasters",
    ]);
  });

  it("valid values can be saved; empty clears; invalid rejected", () => {
    assert.equal(
      normalizeOptionalProspectGetOblicType("small-business"),
      "small-business",
    );
    assert.equal(
      normalizeOptionalProspectGetOblicType("pet_grooming"),
      "pet_grooming",
    );
    assert.equal(normalizeOptionalProspectGetOblicType(""), null);
    assert.equal(normalizeOptionalProspectGetOblicType("   "), null);
    assert.equal(normalizeOptionalProspectGetOblicType(null), null);
    assert.equal(normalizeOptionalProspectGetOblicType(undefined), null);
    assert.throws(
      () => normalizeOptionalProspectGetOblicType("not-a-type"),
      /Invalid GetOblic Type/i,
    );
    assert.throws(
      () => normalizeOptionalProspectGetOblicType("Small-Business"),
      /Invalid GetOblic Type/i,
    );
    assert.equal(isProspectGetOblicType("barbershop"), true);
    assert.equal(isProspectGetOblicType("unknown"), false);
  });

  it("Details UI renders GetOblic Type dropdown", () => {
    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    assert.match(editor, /GetOblic Type/);
    assert.match(editor, /PROSPECT_GETOBLIC_TYPES/);
    assert.match(editor, /<select/);
    assert.match(editor, /getoblic_type/);
    assert.match(editor, /Not set/);
  });

  it("retrieval and update paths include getoblic_type with validation", () => {
    const service = read("services/prospects/prospectService.ts");
    assert.match(service, /getoblic_type/);
    assert.match(service, /normalizeOptionalProspectGetOblicType/);
    assert.match(
      service,
      /payload\.getoblic_type = normalizeOptionalProspectGetOblicType/,
    );

    const patchRoute = read("app/api/prospects/[id]/route.ts");
    assert.match(patchRoute, /getoblic_type:\s*optionalString/);
  });

  it("does not enqueue intelligence regeneration or alter worker/EV paths", () => {
    const meaningful = read("services/prospects/prospectUtils.ts");
    const fieldsBlock = meaningful.slice(
      meaningful.indexOf("PROSPECT_MEANINGFUL_EDIT_FIELDS"),
      meaningful.indexOf("export function hasMeaningfulProspectEdit"),
    );
    assert.doesNotMatch(fieldsBlock, /getoblic_type/);

    const normalization = read("services/prospects/prospectNormalization.ts");
    assert.doesNotMatch(normalization, /getoblic_type/);

    const getoblicModule = read("services/prospects/prospectGetOblicType.ts");
    assert.doesNotMatch(
      getoblicModule,
      /enqueueGeneration|executive_versions|compileMaster|worker/i,
    );
  });
});
