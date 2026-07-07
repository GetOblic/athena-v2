import { NextResponse } from "next/server";
import {
  approveReview,
  requestBriefingRevision,
} from "@/services/reviewService";
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

    const isApprove = action === "approve";
    const isRequestRevision =
      action === "request_revision" || action === "reject";

    if (!isApprove && !isRequestRevision) {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 },
      );
    }

    const review = isApprove
      ? await approveReview(id)
      : await requestBriefingRevision(id);

    if (isApprove && review?.id) {
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
