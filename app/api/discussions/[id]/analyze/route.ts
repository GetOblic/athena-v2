import { NextResponse } from "next/server";
import { getDiscussionById } from "@/services/discussionService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const discussion = await getDiscussionById(id);

    if (!discussion) {
      return NextResponse.json(
        { success: false, error: "Discussion not found" },
        { status: 404 },
      );
    }

    const result = await processDiscussionEndToEnd(id);

    return NextResponse.json({
      success: true,
      discussionId: id,
      analysis: result.analysis,
      opportunity: result.opportunity,
      review: result.review,
      assetBlueprint: result.assetBlueprint,
      status: result.status,
    });
  } catch (error) {
    console.error("Athena discussion analysis failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to analyze discussion" },
      { status: 500 },
    );
  }
}
