import { NextResponse } from "next/server";
import {
  parseProspectCsvDocument,
  validateProspectCsvDataRowLimit,
} from "@/services/prospects/prospectCsv";
import {
  buildProspectImportPreviewPayload,
  prepareProspectImportRows,
} from "@/services/prospects/prospectImportPreparation";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * CSV Prospect import preview — parse + classify only.
 * Never inserts, updates, enqueues, scrapes, or generates.
 */
export async function POST(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
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
            error: { code: "VALIDATION_ERROR", message: "CSV file is required." },
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

    const document = parseProspectCsvDocument(csvText);

    if (document.parseFailure) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              document.parseFailureReason ??
              "CSV could not be parsed.",
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

    const limit = validateProspectCsvDataRowLimit(document.records.length);
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

    const batch = await prepareProspectImportRows({
      organizationId,
      records: document.records,
    });

    const preview = buildProspectImportPreviewPayload({
      batch,
      recognizedColumns: document.recognizedColumns.map(String),
      ignoredColumns: document.ignoredColumns,
    });

    return json({
      ok: true,
      success: true,
      mode: "preview",
      preview,
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

    console.error("[PROSPECT_IMPORT_PREVIEW] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "PREVIEW_FAILED",
          message: "Prospect CSV preview failed.",
        },
      },
      500,
    );
  }
}
