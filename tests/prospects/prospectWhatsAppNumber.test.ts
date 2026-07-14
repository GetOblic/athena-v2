import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseProspectCsv } from "../../services/prospects/prospectCsv";
import {
  formatNormalizedProspectInputForPipeline,
  normalizeProspectExecutiveInput,
} from "../../services/prospects/prospectNormalization";
import { buildWhatsAppMeUrl } from "../../services/prospects/prospectWhatsApp";

const ROOT = join(process.cwd());

describe("Prospect WhatsApp Number field", () => {
  it("migration adds nullable whatsapp_number only", () => {
    const migration = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20260719000001_add_prospect_whatsapp_number.sql",
      ),
      "utf8",
    );
    assert.match(migration, /whatsapp_number text/);
    assert.match(migration, /Optional WhatsApp contact number/);
    assert.doesNotMatch(migration, /athena_asset_interactions/);
  });

  it("CSV aliases map to whatsapp_number without treating it as a duplicate key", () => {
    const rows = parseProspectCsv(
      "business_name,phone,whatsapp_phone\nAcme,+1-312-555-0100,+1 (312) 555-0199\n",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phone, "+1-312-555-0100");
    assert.equal(rows[0].whatsapp_number, "+1 (312) 555-0199");

    const aliasRows = parseProspectCsv(
      "company_name,wa_number\nBeta,+15551234567\n",
    );
    assert.equal(aliasRows[0].whatsapp_number, "+15551234567");
  });

  it("template includes WhatsApp Number near Phone", () => {
    const template = readFileSync(
      join(ROOT, "public/templates/athena-prospect-import-template.csv"),
      "utf8",
    );
    assert.match(template, /Phone,WhatsApp Number/);
  });

  it("Manual Import and Details UI include WhatsApp Number", () => {
    const importForms = readFileSync(
      join(ROOT, "components/prospects/ProspectImportForms.tsx"),
      "utf8",
    );
    const details = readFileSync(
      join(ROOT, "components/prospects/ProspectMetadataEditor.tsx"),
      "utf8",
    );
    const page = readFileSync(join(ROOT, "app/prospects/[id]/page.tsx"), "utf8");
    const patchRoute = readFileSync(
      join(ROOT, "app/api/prospects/[id]/route.ts"),
      "utf8",
    );
    const createRoute = readFileSync(
      join(ROOT, "app/api/prospects/route.ts"),
      "utf8",
    );

    assert.match(importForms, /whatsapp_number/);
    assert.match(importForms, /WhatsApp Number/);
    assert.match(details, /whatsapp_number/);
    assert.match(details, /Open WhatsApp/);
    assert.match(page, /WhatsApp Number/);
    assert.match(page, /prospect\.whatsapp_number/);
    assert.match(patchRoute, /whatsapp_number:\s*optionalString/);
    assert.match(createRoute, /whatsapp_number:/);
  });

  it("wa.me normalization keeps stored value independent and rejects unusable values", () => {
    assert.equal(
      buildWhatsAppMeUrl("+1 (312) 555-0199"),
      "https://wa.me/13125550199",
    );
    assert.equal(buildWhatsAppMeUrl("   "), null);
    assert.equal(buildWhatsAppMeUrl("abc"), null);
    assert.equal(buildWhatsAppMeUrl("123"), null);
  });

  it("normalized executive input includes WhatsApp when present and keeps phone separate", () => {
    const normalized = normalizeProspectExecutiveInput({
      business_name: "Acme",
      website: "https://acme.com",
      phone: "+1-312-555-0100",
      whatsapp_number: "+1 (312) 555-0199",
    } as never);
    const factual = formatNormalizedProspectInputForPipeline(normalized);
    assert.match(factual, /Phone: \+1-312-555-0100/);
    assert.match(factual, /WhatsApp: \+1 \(312\) 555-0199/);
  });
});
