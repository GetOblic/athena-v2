import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";
import {
  LicenseeProspectClientConversionError,
  promoteLicenseeProspectToClient,
} from "@/services/licensee/licenseeProspectClientConversion";
import { httpStatusForLicenseeProspectClientConversionCode } from "@/services/licensee/licenseeProspectClientConversionReads";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonError(status: number, code: string, message: string) {
  return json(
    {
      ok: false,
      success: false,
      error: { code, message },
    },
    status,
  );
}

/**
 * Convert an Own-Company Prospect into a Licensee-managed client.
 * Thin adapter: trusted tenant context only. Domain service is authoritative.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();

    const result = await promoteLicenseeProspectToClient({
      prospectId: id,
      sourceOrganizationId: organizationId,
      actingUserId: userId,
    });

    revalidatePath("/prospects");
    revalidatePath(`/prospects/${id}`);
    revalidatePath("/");
    revalidatePath("/licensee");

    return json({
      ok: true,
      success: true,
      alreadyActive: result.alreadyActive,
      reattached: result.reattached,
      clientOrganizationId: result.clientOrganizationId,
      clientAccountEmail: result.clientAccountEmail,
      conversionId: result.conversion.id,
      status: result.conversion.status,
      continuityInitialized: result.continuityInitialized,
      continuityState: result.continuityState,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return jsonError(401, "UNAUTHORIZED", "Authentication required");
    }

    if (error instanceof LicenseeAccessError) {
      return jsonError(
        403,
        error.code || "LICENSEE_ACCESS_DENIED",
        error.message,
      );
    }

    if (error instanceof LicenseeProspectClientConversionError) {
      return jsonError(
        httpStatusForLicenseeProspectClientConversionCode(error.code),
        error.code,
        error.message,
      );
    }

    console.error("[PROSPECT_CONVERT_TO_CLIENT] failed", error);
    return jsonError(
      500,
      "CONVERSION_FAILED",
      error instanceof Error
        ? error.message
        : "Failed to convert Prospect to client.",
    );
  }
}
