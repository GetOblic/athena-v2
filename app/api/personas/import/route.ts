import { NextResponse } from "next/server";
import {
  parsePersonaCsvDocument,
  validatePersonaCsvDataRowLimit,
} from "@/services/personas/personaCsv";
import { importPersonasFromRows } from "@/services/personas/personaImporter";
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

/** CSV Persona import — persist only; no generation enqueue (Stage 2). */
export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    const contentType = request.headers.get("content-type") ?? "";

    let csvText: string | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "CSV file is required.",
            },
          },
          400,
        );
      }
      csvText = await file.text();
    } else {
      const body = (await request.json()) as { csvText?: string };
      if (typeof body.csvText === "string") {
        csvText = body.csvText;
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

    const document = parsePersonaCsvDocument(csvText);

    if (document.parseFailure) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              document.parseFailureReason ?? "CSV could not be parsed.",
          },
        },
        400,
      );
    }

    if (document.delimiterFailure) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              document.delimiterFailureReason ??
              "CSV headers could not be interpreted.",
          },
        },
        400,
      );
    }

    if (document.records.length === 0) {
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

    const limit = validatePersonaCsvDataRowLimit(document.records.length);
    if (!limit.ok) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "VALIDATION_ERROR", message: limit.message },
        },
        400,
      );
    }

    const summary = await importPersonasFromRows({
      organizationId,
      userId,
      records: document.records,
      source: "csv",
    });

    return json({
      ok: true,
      success: true,
      mode: "csv",
      summary: {
        imported: summary.imported,
        warnings: summary.warnings,
        duplicates: summary.duplicates,
        invalidRows: summary.invalidRows,
        failed: summary.failed,
        batchId: summary.batchId,
        invalidRowDetails: summary.invalidRowDetails,
      },
      message: [
        `Imported: ${summary.imported}`,
        `Warnings: ${summary.warnings}`,
        `Duplicates skipped: ${summary.duplicates}`,
        `Invalid skipped: ${summary.invalidRows}`,
        `Failed: ${summary.failed}`,
      ].join("\n"),
    });
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

    console.error("[PERSONA_IMPORT] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "IMPORT_FAILED",
          message: "Persona CSV import failed.",
        },
      },
      500,
    );
  }
}
