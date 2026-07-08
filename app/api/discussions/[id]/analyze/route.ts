import { NextResponse } from "next/server";
import { getDiscussionById } from "@/services/discussionService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";

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

    return NextResponse.json({
      success: true,
      discussionId: id,
      message: "Discussion intelligence regenerated successfully",
      analysis: result.analysis,
      opportunity: result.opportunity,
      review: result.review,
      assetBlueprint: result.assetBlueprint,
      status: result.status,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Athena discussion analysis failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to analyze discussion";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
