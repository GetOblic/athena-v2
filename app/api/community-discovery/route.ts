import { NextResponse } from "next/server";
import { communityDiscoveryDb } from "@/services/communityDiscovery/communityDiscoveryDb";
import {
  communityDiscoveryAuthFailure,
  readCommunityDiscoveryJson,
} from "@/services/communityDiscovery/communityDiscoveryHttp";
import { readCommunityDiscoveryAction } from "@/services/communityDiscovery/communityDiscoveryQuery";
import { getCommunityDiscoveryLedger } from "@/services/communityDiscovery/communityDiscoveryLedger";
import { createSupabasePublicCommunityCatalog } from "@/services/communityDiscovery/communityDiscoveryPersistence";
import {
  communityDiscoveryRecoveryResponse,
  discoverFacebookGroups,
} from "@/services/communityDiscovery/discoverCommunities";
import { createBraveCommunitySearchProvider } from "@/services/communityDiscovery/braveSearchProvider";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const action = readCommunityDiscoveryAction(await readCommunityDiscoveryJson(request));
    if (action.kind === "restore") {
      const recovery = getCommunityDiscoveryLedger().restore({
        organizationId,
        sessionToken: action.sessionToken,
      });
      return json({
        ok: true,
        discovery: communityDiscoveryRecoveryResponse(recovery),
      });
    }
    const discovery = await discoverFacebookGroups({
      organizationId,
      objective: action.objective,
      continuationToken: action.continuationToken,
      ledger: getCommunityDiscoveryLedger(),
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
