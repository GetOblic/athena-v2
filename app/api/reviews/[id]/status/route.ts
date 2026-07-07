import { NextResponse } from "next/server";
import { approveReview, rejectReview } from "@/services/reviewService";
import { emitBrainEvent } from "@/services/brain/eventBus";
import { registerBrainProcessors } from "@/services/brain/brainProcessor";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

registerBrainProcessors();

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const action = body?.action;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 },
      );
    }

    const review =
      action === "approve" ? await approveReview(id) : await rejectReview(id);

    if (action === "approve" && review?.id) {
      await emitBrainEvent("briefing.approved", { reviewId: review.id });
    }

    if (!review) {
      return NextResponse.json(
        { success: false, error: "Executive Briefing not found or update failed" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Athena review status update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update review status" },
      { status: 500 },
    );
  }
}
