import { getGetOblicLinksHealth } from "@/lib/getoblic-links/server";
import {
  licenseeGetOblicLinksError,
  licenseeGetOblicLinksJson,
} from "@/lib/getoblic-links/licenseeRouteResponse";
import {
  assertNoLicenseeGetOblicOrganizationSelection,
  requireLicenseeGetOblicLinksAccess,
} from "@/services/licensee/licenseeGetOblicLinksAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireLicenseeGetOblicLinksAccess();
    assertNoLicenseeGetOblicOrganizationSelection(request);
    const health = await getGetOblicLinksHealth();
    return licenseeGetOblicLinksJson({
      ok: true,
      healthy: health.healthy,
      status: health.status,
      service: health.service,
      timestamp: health.timestamp,
      kvBinding: health.kvBinding,
    });
  } catch (error) {
    return licenseeGetOblicLinksError(error);
  }
}
