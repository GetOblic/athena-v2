import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LicenseeAccessError } from "@/services/licensee/licenseeIdentity";
import { LicenseeOwnCompanyError } from "@/services/licensee/licenseeSubAccounts";
import {
  LicenseeProspectClientConversionError,
  reverseLicenseeProspectClientConversion,
} from "@/services/licensee/licenseeProspectClientConversion";
import {
  getActiveConversionForRelationshipId,
  httpStatusForLicenseeProspectClientConversionCode,
} from "@/services/licensee/licenseeProspectClientConversionReads";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Master-side reversal: detach the Licensee relationship only.
 * Identifies the conversion from the owned relationship. Domain service
 * remains authoritative.
 */
export async function POST(request: NextRequest) {
  let body: { relationshipId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  const relationshipId = body.relationshipId?.trim();
  if (!relationshipId) {
    return jsonError(400, "INVALID_BODY", "relationshipId is required.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const conversion = await getActiveConversionForRelationshipId(
      relationshipId,
    );
    if (!conversion) {
      return jsonError(
        404,
        "CONVERSION_NOT_FOUND",
        "No active Prospect conversion exists for this sub-account.",
      );
    }

    const result = await reverseLicenseeProspectClientConversion({
      prospectId: conversion.prospectId,
      sourceOrganizationId: conversion.sourceOrganizationId,
      masterUserId: user.id,
    });

    revalidatePath("/licensee");
    revalidatePath("/prospects");
    revalidatePath("/");

    return NextResponse.json(
      {
        ok: true,
        alreadyReversed: result.alreadyReversed,
        prospectId: result.conversion.prospectId,
        clientOrganizationId: result.clientOrganizationId,
        clientAccountEmail: result.clientAccountEmail,
        status: result.conversion.status,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof LicenseeAccessError) {
      return jsonError(403, error.code || error.name, error.message);
    }

    if (error instanceof LicenseeOwnCompanyError) {
      return jsonError(409, error.code, error.message);
    }

    if (error instanceof LicenseeProspectClientConversionError) {
      return jsonError(
        httpStatusForLicenseeProspectClientConversionCode(error.code),
        error.code,
        error.message,
      );
    }

    console.error("[LICENSEE_RESTORE_TO_PROSPECT] failed", error);
    return jsonError(
      500,
      "RESTORE_FAILED",
      error instanceof Error ? error.message : "Restore failed.",
    );
  }
}
