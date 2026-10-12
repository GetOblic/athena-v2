import { NextResponse } from "next/server";
import { communityDiscoveryDb } from "@/services/communityDiscovery/communityDiscoveryDb";
import {
  communityDiscoveryAuthFailure,
  readCommunityDiscoveryJson,
} from "@/services/communityDiscovery/communityDiscoveryHttp";
import { COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS } from "@/services/communityDiscovery/communityDiscoveryLimits";
import {
  createSupabaseOrganizationCommunitySaves,
  createSupabasePublicCommunityCatalog,
} from "@/services/communityDiscovery/communityDiscoveryPersistence";
import {
  listSavedOrganizationCommunities,
  saveOrganizationCommunity,
} from "@/services/communityDiscovery/organizationCommunitySaves";
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

function repository() {
  return createSupabaseOrganizationCommunitySaves(communityDiscoveryDb());
}

export async function GET() {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const saves = await listSavedOrganizationCommunities({
      organizationId,
      repository: repository(),
    });
    return json({ ok: true, saves });
  } catch (error) {
    const mapped = communityDiscoveryAuthFailure(error);
    if (mapped) {
      return json(
        { ok: false, error: { code: mapped.code, message: mapped.message } },
        mapped.status,
      );
    }
    console.error("[ATHENA_COMMUNITY_DISCOVERY] saves_list_failed");
    return json(
      {
        ok: false,
        error: {
          code: "SAVES_FAILED",
          message: "Saved communities could not be listed.",
        },
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = await readCommunityDiscoveryJson(request);
    const db = communityDiscoveryDb();
    const save = await saveOrganizationCommunity({
      organizationId,
      body,
      repository: createSupabaseOrganizationCommunitySaves(db),
      catalog: createSupabasePublicCommunityCatalog(db),
    });
    return json({ ok: true, save });
  } catch (error) {
    const mapped = communityDiscoveryAuthFailure(error);
    if (mapped) {
      return json(
        { ok: false, error: { code: mapped.code, message: mapped.message } },
        mapped.status,
      );
    }
    console.error("[ATHENA_COMMUNITY_DISCOVERY] save_failed");
    return json(
      {
        ok: false,
        error: {
          code: "SAVE_FAILED",
          message: "The community could not be saved.",
        },
      },
      500,
    );
  }
}
