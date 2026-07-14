import { NextResponse } from "next/server";
import {
  addAssetUsageTag,
  listAssetInteractions,
  recordAssetCopyInteraction,
  removeAssetUsageTag,
} from "@/services/assetInteractions/assetInteractionService";
import {
  isSupportedAssetInteractionType,
  LIVE_EXECUTIVE_VERSION_SENTINEL,
  type AssetInteractionSourceType,
} from "@/services/assetInteractions/assetInteractionKeys";
import { parseAssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import { getDiscussionById } from "@/services/discussionService";
import { getExecutiveVersionById } from "@/services/executiveVersions/executiveVersionService";
import { getProspectById } from "@/services/prospects/prospectService";
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

function parseSourceType(value: unknown): AssetInteractionSourceType | null {
  if (value === "discussion" || value === "prospect") return value;
  return null;
}

async function resolveDiscussionIdForSource(input: {
  organizationId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
}): Promise<string | null> {
  if (input.sourceType === "discussion") {
    const discussion = await getDiscussionById(
      input.sourceId,
      input.organizationId,
    );
    return discussion?.id ?? null;
  }

  const prospect = await getProspectById(input.sourceId, input.organizationId);
  return prospect?.linked_discussion_id ?? null;
}

async function assertSourceAccess(input: {
  organizationId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
}): Promise<boolean> {
  if (input.sourceType === "discussion") {
    const discussion = await getDiscussionById(
      input.sourceId,
      input.organizationId,
    );
    return Boolean(discussion);
  }
  const prospect = await getProspectById(input.sourceId, input.organizationId);
  return Boolean(prospect);
}

async function assertExecutiveVersionAccess(input: {
  organizationId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId: string | null;
}): Promise<boolean> {
  const versionId = input.executiveVersionId?.trim() || null;
  if (!versionId || versionId === LIVE_EXECUTIVE_VERSION_SENTINEL) {
    return true;
  }

  const discussionId = await resolveDiscussionIdForSource({
    organizationId: input.organizationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  if (!discussionId) {
    return false;
  }

  const version = await getExecutiveVersionById(
    versionId,
    discussionId,
    input.organizationId,
  );
  return Boolean(version);
}

/** List Done + usage tags for a workspace version. */
export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const sourceType = parseSourceType(url.searchParams.get("sourceType"));
    const sourceId = url.searchParams.get("sourceId")?.trim() ?? "";
    const executiveVersionId =
      url.searchParams.get("executiveVersionId")?.trim() || null;

    if (!sourceType || !sourceId) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "sourceType and sourceId are required.",
          },
        },
        400,
      );
    }

    const allowed = await assertSourceAccess({
      organizationId,
      sourceType,
      sourceId,
    });
    if (!allowed) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Source not found." },
        },
        404,
      );
    }

    const versionAllowed = await assertExecutiveVersionAccess({
      organizationId,
      sourceType,
      sourceId,
      executiveVersionId,
    });
    if (!versionAllowed) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Executive Version not found.",
          },
        },
        404,
      );
    }

    const interactions = await listAssetInteractions({
      organizationId,
      userId,
      sourceType,
      sourceId,
      executiveVersionId,
    });

    return json({
      ok: true,
      success: true,
      interactions,
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
    console.error("[ASSET_INTERACTIONS_GET] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "LOOKUP_FAILED",
          message: "Could not load asset interactions.",
        },
      },
      500,
    );
  }
}

/**
 * Record clipboard copy (default), or add/remove one usage tag.
 * POST without usageTag preserves existing copied behavior.
 */
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

    const body = (await request.json()) as Record<string, unknown>;
    const sourceType = parseSourceType(body.sourceType);
    const sourceId = String(body.sourceId ?? "").trim();
    const assetType = String(body.assetType ?? "").trim();
    const executiveVersionId =
      typeof body.executiveVersionId === "string" &&
      body.executiveVersionId.trim()
        ? body.executiveVersionId.trim()
        : null;
    const usageTag = parseAssetUsageTag(body.usageTag);
    const actionRaw = String(body.action ?? "add")
      .trim()
      .toLowerCase();
    const action = actionRaw === "remove" ? "remove" : "add";

    if (!sourceType || !sourceId || !assetType) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "sourceType, sourceId, and assetType are required.",
          },
        },
        400,
      );
    }

    if (!isSupportedAssetInteractionType(assetType)) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Unsupported asset type.",
          },
        },
        400,
      );
    }

    if (body.usageTag != null && body.usageTag !== "" && !usageTag) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Unsupported usage tag.",
          },
        },
        400,
      );
    }

    const allowed = await assertSourceAccess({
      organizationId,
      sourceType,
      sourceId,
    });
    if (!allowed) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: "NOT_FOUND", message: "Source not found." },
        },
        404,
      );
    }

    const versionAllowed = await assertExecutiveVersionAccess({
      organizationId,
      sourceType,
      sourceId,
      executiveVersionId,
    });
    if (!versionAllowed) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Executive Version not found.",
          },
        },
        404,
      );
    }

    // Usage-tag path — never creates/toggles copied.
    if (usageTag) {
      const state =
        action === "remove"
          ? await removeAssetUsageTag({
              organizationId,
              userId,
              sourceType,
              sourceId,
              executiveVersionId,
              assetType,
              usageTag,
            })
          : await addAssetUsageTag({
              organizationId,
              userId,
              sourceType,
              sourceId,
              executiveVersionId,
              assetType,
              usageTag,
            });

      return json({
        ok: true,
        success: true,
        interaction: state,
        done: state.done,
        tags: state.tags,
      });
    }

    // Default: record copied (existing Copy/Done contract).
    const interaction = await recordAssetCopyInteraction({
      organizationId,
      userId,
      sourceType,
      sourceId,
      executiveVersionId,
      assetType,
    });

    return json({
      ok: true,
      success: true,
      interaction: {
        ...interaction,
        tags: [],
      },
      done: true,
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
    console.error("[ASSET_INTERACTIONS_POST] failed", error);
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: "RECORD_FAILED",
          message: "Could not record asset interaction.",
        },
      },
      500,
    );
  }
}
