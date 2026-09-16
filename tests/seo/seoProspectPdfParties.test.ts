import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSeoProspectPdfParties } from "../../services/seo/seoProspectPdf/resolveSeoProspectPdfParties";
import type { SeoProspectPdfPartyDeps } from "../../services/seo/seoProspectPdf/resolveSeoProspectPdfParties";

const SUBJECT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Prospect Clinic",
};
const SENDER = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Licensee Studio",
};
const FOREIGN = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Unrelated Org",
};

function deps(overrides: Partial<SeoProspectPdfPartyDeps>): SeoProspectPdfPartyDeps {
  return {
    getOrganizationById: async (id) => {
      if (id === SUBJECT.id) return SUBJECT;
      if (id === SENDER.id) return SENDER;
      if (id === FOREIGN.id) return FOREIGN;
      return null;
    },
    isLicenseeOwnCompanyOrganization: async () => false,
    listLicenseeAccountsForSubAccountOrganization: async () => [],
    ...overrides,
  };
}

describe("SEO prospect PDF party resolution", () => {
  it("uses the current organization as sender for an ordinary tenant", async () => {
    const parties = await resolveSeoProspectPdfParties(SUBJECT.id, deps({}));
    assert.equal(parties.subject.organizationId, SUBJECT.id);
    assert.equal(parties.sender.organizationId, SUBJECT.id);
    assert.equal(parties.sender.name, SUBJECT.name);
  });

  it("uses the current organization when it is the licensee own-company", async () => {
    const parties = await resolveSeoProspectPdfParties(
      SENDER.id,
      deps({
        isLicenseeOwnCompanyOrganization: async (id) => id === SENDER.id,
        listLicenseeAccountsForSubAccountOrganization: async () => [
          { id: "lic-1", own_company_organization_id: SENDER.id },
        ],
      }),
    );
    assert.equal(parties.subject.organizationId, SENDER.id);
    assert.equal(parties.sender.organizationId, SENDER.id);
  });

  it("uses the licensee own-company as sender for a client sub-account", async () => {
    const parties = await resolveSeoProspectPdfParties(
      SUBJECT.id,
      deps({
        isLicenseeOwnCompanyOrganization: async (id) => id === SENDER.id,
        listLicenseeAccountsForSubAccountOrganization: async () => [
          { id: "lic-1", own_company_organization_id: SENDER.id },
        ],
      }),
    );
    assert.equal(parties.subject.organizationId, SUBJECT.id);
    assert.equal(parties.subject.name, SUBJECT.name);
    assert.equal(parties.sender.organizationId, SENDER.id);
    assert.equal(parties.sender.name, SENDER.name);
  });

  it("falls back to the current organization when own-company is missing", async () => {
    const parties = await resolveSeoProspectPdfParties(
      SUBJECT.id,
      deps({
        listLicenseeAccountsForSubAccountOrganization: async () => [
          { id: "lic-1", own_company_organization_id: null },
        ],
      }),
    );
    assert.equal(parties.sender.organizationId, SUBJECT.id);
  });

  it("does not read a foreign brand from a malformed or unrelated relationship", async () => {
    const multiple = await resolveSeoProspectPdfParties(
      SUBJECT.id,
      deps({
        isLicenseeOwnCompanyOrganization: async (id) => id === FOREIGN.id,
        listLicenseeAccountsForSubAccountOrganization: async () => [
          { id: "lic-1", own_company_organization_id: SENDER.id },
          { id: "lic-2", own_company_organization_id: FOREIGN.id },
        ],
      }),
    );
    assert.equal(multiple.sender.organizationId, SUBJECT.id);

    const undesignated = await resolveSeoProspectPdfParties(
      SUBJECT.id,
      deps({
        isLicenseeOwnCompanyOrganization: async () => false,
        listLicenseeAccountsForSubAccountOrganization: async () => [
          { id: "lic-1", own_company_organization_id: FOREIGN.id },
        ],
      }),
    );
    assert.equal(undesignated.sender.organizationId, SUBJECT.id);

    const missingOrg = await resolveSeoProspectPdfParties(
      SUBJECT.id,
      deps({
        isLicenseeOwnCompanyOrganization: async (id) => id === "missing-own",
        listLicenseeAccountsForSubAccountOrganization: async () => [
          { id: "lic-1", own_company_organization_id: "missing-own" },
        ],
      }),
    );
    assert.equal(missingOrg.sender.organizationId, SUBJECT.id);
  });
});
