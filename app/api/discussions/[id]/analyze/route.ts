import { NextResponse } from "next/server";
import { getDiscussionById } from "@/services/discussionService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const discussion = await getDiscussionById(id, organizationId);

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    const result = await processDiscussionEndToEnd(id, organizationId);

    const payload = {
      success: true as const,
      discussionId: id,
      message: "Discussion intelligence regenerated successfully",
      analysis: result.analysis,
      opportunity: result.opportunity,
      review: result.review,
      assetBlueprint: result.assetBlueprint,
      status: result.status,
    };

    try {
      JSON.stringify(payload);
    } catch (serializeError) {
      console.error("Regenerate intelligence failed", serializeError);
      return NextResponse.json({
        success: true,
        discussionId: id,
        message: "Discussion intelligence regenerated successfully",
        status: result.status,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Regenerate intelligence failed", error);

    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Regeneration failed",
      },
      { status: 500 },
    );
  }
}
