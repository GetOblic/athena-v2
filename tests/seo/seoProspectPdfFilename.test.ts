import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSeoProspectPdfFilename,
  parseContentDispositionFilename,
  slugifySeoProspectPdfSubject,
} from "../../services/seo/seoProspectPdf/seoProspectPdfFilename";

describe("SEO prospect PDF filename", () => {
  it("slugifies subject names to ASCII hyphenated tokens", () => {
    assert.equal(slugifySeoProspectPdfSubject("Prospect Clinic"), "prospect-clinic");
    assert.equal(slugifySeoProspectPdfSubject("Café  Núñez!"), "cafe-nunez");
    assert.equal(slugifySeoProspectPdfSubject("@@@"), "seo-report");
    assert.equal(slugifySeoProspectPdfSubject(""), "seo-report");
  });

  it("builds lens-specific dated filenames from the subject name", () => {
    assert.equal(
      buildSeoProspectPdfFilename({
        subjectName: "Prospect Clinic",
        generationType: "intelligence",
        reportDateIso: "2026-09-16T10:00:00.000Z",
      }),
      "prospect-clinic-visibility-strategy-2026-09-16.pdf",
    );
    assert.equal(
      buildSeoProspectPdfFilename({
        subjectName: "Prospect Clinic",
        generationType: "technical",
        reportDateIso: "2026-09-16T10:00:00.000Z",
      }),
      "prospect-clinic-website-technical-health-2026-09-16.pdf",
    );
  });

  it("accepts only safe Content-Disposition filenames", () => {
    assert.equal(
      parseContentDispositionFilename(
        'attachment; filename="prospect-clinic-visibility-strategy-2026-09-16.pdf"',
      ),
      "prospect-clinic-visibility-strategy-2026-09-16.pdf",
    );
    assert.equal(
      parseContentDispositionFilename(
        "attachment; filename=evil.pdf",
      ),
      null,
    );
    assert.equal(
      parseContentDispositionFilename(
        "attachment; filename=../../secret.pdf",
      ),
      null,
    );
  });
});
