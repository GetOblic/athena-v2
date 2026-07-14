import { NextResponse } from "next/server";
import {
  clearOrganizationBrandLogo,
  OrganizationBrandNotFoundError,
  replaceOrganizationBrandLogo,
} from "@/services/identity/brandIdentityService";
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

/** Upload or replace the organization client logo. Does not compile Brain. */
export async function POST(request: Request) {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    if (!userId) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Logo file is required.",
          },
        },
        400,
      );
    }

    const result = await replaceOrganizationBrandLogo({
      organizationId,
      file,
    });

    return json({
      ok: true,
      success: true,
      storagePath: result.brand.brand_logo_storage_path ?? null,
      previewUrl: result.previewUrl,
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
    if (error instanceof OrganizationBrandNotFoundError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: error.message },
        },
        404,
      );
    }

    const message =
      error instanceof Error ? error.message : "Could not upload logo.";
    const isValidation =
      /unsupported|empty|smaller|2 mb|type/i.test(message) ||
      message.includes("Logo");

    console.error("[BRAND_LOGO_POST] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: isValidation ? "VALIDATION_ERROR" : "UPLOAD_FAILED",
          message,
        },
      },
      isValidation ? 400 : 500,
    );
  }
}

/** Remove the organization client logo. Does not compile Brain. */
export async function DELETE() {
  try {
    const { organizationId, userId } =
      await requireCurrentOrganizationContext();
    if (!userId) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    await clearOrganizationBrandLogo({ organizationId });

    return json({
      ok: true,
      success: true,
      storagePath: null,
      previewUrl: null,
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
    if (error instanceof OrganizationBrandNotFoundError) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: error.message },
        },
        404,
      );
    }

    console.error("[BRAND_LOGO_DELETE] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "REMOVE_FAILED",
          message: "Could not remove logo.",
        },
      },
      500,
    );
  }
}
