import { NextResponse } from "next/server";
import {
  importProspectsFromRows,
  parseProspectCsv,
} from "@/services/prospects/prospectImporter";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** CSV Prospect import — persist + enqueue only; no AI / homepage scrape. */
export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const contentType = request.headers.get("content-type") ?? "";

    let rows;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return json(
          {
            ok: false,
            success: false,
            error: { code: "VALIDATION_ERROR", message: "CSV file is required." },
          },
          400,
        );
      }
      rows = parseProspectCsv(await file.text());
    } else {
      const body = (await request.json()) as { csvText?: string; rows?: unknown };
      if (typeof body.csvText === "string") {
        rows = parseProspectCsv(body.csvText);
      } else {
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "CSV file or csvText is required.",
            },
          },
          400,
        );
      }
    }

    if (rows.length === 0) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "CSV contained no data rows.",
          },
        },
        400,
      );
    }

    const summary = await importProspectsFromRows({
      organizationId,
      userId,
      rows,
      source: "csv",
    });

    return json(
      {
        ok: true,
        success: true,
        mode: "csv",
        summary: {
          imported: summary.imported,
          duplicates: summary.duplicates,
          invalidWebsites: summary.invalidWebsites,
          invalidRows: summary.invalidRows,
          queued: summary.queued,
          withoutWebsite: summary.withoutWebsite,
          batchId: summary.batchId,
          invalidRowDetails: summary.invalidRowDetails,
        },
        message: [
          `Imported: ${summary.imported}`,
          `Duplicates skipped: ${summary.duplicates}`,
          `Invalid rows: ${summary.invalidRows}`,
          `Invalid websites: ${summary.invalidWebsites}`,
          `Queued for analysis: ${summary.queued}`,
          `Created without website: ${summary.withoutWebsite}`,
        ].join("\n"),
      },
      202,
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    console.error("[PROSPECT_IMPORT] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "IMPORT_FAILED",
          message: "Prospect CSV import failed.",
        },
      },
      500,
    );
  }
}
