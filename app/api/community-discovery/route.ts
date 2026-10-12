import { NextResponse } from "next/server";
import { communityDiscoveryDb } from "@/services/communityDiscovery/communityDiscoveryDb";
import {
  communityDiscoveryAuthFailure,
  readCommunityDiscoveryJson,
} from "@/services/communityDiscovery/communityDiscoveryHttp";
import { COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS } from "@/services/communityDiscovery/communityDiscoveryLimits";
import { createSupabasePublicCommunityCatalog } from "@/services/communityDiscovery/communityDiscoveryPersistence";
import { discoverFacebookGroups } from "@/services/communityDiscovery/discoverCommunities";
import { createBraveCommunitySearchProvider } from "@/services/communityDiscovery/braveSearchProvider";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = await readCommunityDiscoveryJson(request);
    const objective =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { objective?: unknown }).objective
        : undefined;
    const discovery = await discoverFacebookGroups({
      organizationId,
      objective,
      provider: createBraveCommunitySearchProvider(),
      catalog: createSupabasePublicCommunityCatalog(communityDiscoveryDb()),
      signal: request.signal,
    });
    return json({ ok: true, discovery });
  } catch (error) {
    const mapped = communityDiscoveryAuthFailure(error);
    if (mapped) {
      return json(
        { ok: false, error: { code: mapped.code, message: mapped.message } },
        mapped.status,
      );
    }
    console.error("[ATHENA_COMMUNITY_DISCOVERY] request_failed");
    return json(
      {
        ok: false,
        error: {
          code: "DISCOVERY_FAILED",
          message: "Community discovery failed.",
        },
      },
      500,
    );
  }
}
