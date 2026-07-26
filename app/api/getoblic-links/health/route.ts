import { NextResponse } from "next/server";
import {
  getGetOblicLinksHealth,
  toAthenaApiError,
} from "@/lib/getoblic-links/server";
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

export async function GET() {
  try {
    await requireCurrentOrganizationContext();
    const health = await getGetOblicLinksHealth();
    return json({
      ok: true,
      healthy: health.healthy,
      status: health.status,
      service: health.service,
      timestamp: health.timestamp,
      kvBinding: health.kvBinding,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return json(
        {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    const mapped = toAthenaApiError(error);
    return json(mapped.body, mapped.status);
  }
}
