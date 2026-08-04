import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("seo report API surface", () => {
  it("exposes list/create/detail/delete/status/generate/regenerate routes", () => {
    const listCreate = read("app/api/seo/route.ts");
    assert.match(listCreate, /export async function GET/);
    assert.match(listCreate, /export async function POST/);
    assert.match(listCreate, /createSeoReportWithJob/);
    assert.match(listCreate, /202/);

    const detail = read("app/api/seo/[id]/route.ts");
    assert.match(detail, /export async function GET/);
    assert.match(detail, /export async function DELETE/);
    assert.match(detail, /revalidatePath\("\/seo"\)/);

    assert.match(read("app/api/seo/[id]/status/route.ts"), /toPublicSeoReportStatus/);
    assert.match(
      read("app/api/seo/[id]/generate/route.ts"),
      /enqueueGenerationForExistingReport/,
    );
    assert.match(
      read("app/api/seo/[id]/regenerate/route.ts"),
      /regenerateSeoReport/,
    );
  });

  it("strips client-supplied organization ownership on create", () => {
    const route = read("app/api/seo/route.ts");
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /organizationId: _organizationIdCamel/);
    assert.match(route, /requireCurrentOrganizationContext/);
  });
});
