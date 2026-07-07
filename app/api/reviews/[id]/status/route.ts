import { NextResponse } from "next/server";
import {
  approveReview,
  requestBriefingRevision,
  ReviewNotFoundError,
  ReviewUpdateError,
  toBriefingStatusUpdate,
} from "@/services/reviewService";
import { emitBrainEvent } from "@/services/brain/eventBus";
import { registerBrainProcessors } from "@/services/brain/brainProcessor";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

registerBrainProcessors();

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
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
      ? await approveReview(id, organizationId)
      : await requestBriefingRevision(id, organizationId);

    if (isApprove) {
      try {
        await emitBrainEvent("briefing.approved", {
          reviewId: review.id,
          organizationId,
        });
      } catch (brainError) {
        console.error("Brain learning after approval failed:", brainError);
      }
    }

    return NextResponse.json({
      success: true,
      review: toBriefingStatusUpdate(review),
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    if (error instanceof ReviewNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }

    if (error instanceof ReviewUpdateError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    console.error("Athena review status update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update review status" },
      { status: 500 },
    );
  }
}
