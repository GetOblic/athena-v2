import { NextResponse } from "next/server";
import {
  getOpportunityById,
  OpportunityNotFoundError,
  OpportunityUpdateError,
  parseOpportunityStatusKey,
  updateOpportunityStatus,
} from "@/services/opportunityService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";
import { normalizeOpportunityStatus } from "@/lib/opportunityStatus";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = await request.json();
    const statusKey = parseOpportunityStatusKey(body?.status);

    if (!statusKey) {
      return NextResponse.json(
        { success: false, error: "Invalid sales status" },
        { status: 400 },
      );
    }

    const existing = await getOpportunityById(id, organizationId);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Opportunity not found" },
        { status: 404 },
      );
    }

    const opportunity = await updateOpportunityStatus(
      id,
      organizationId,
      statusKey,
    );

    return NextResponse.json({
      success: true,
      opportunity: {
        id: opportunity.id,
        status: normalizeOpportunityStatus(opportunity.status),
      },
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    if (error instanceof OpportunityNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }

    if (error instanceof OpportunityUpdateError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    console.error("Opportunity status update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update opportunity status" },
      { status: 500 },
    );
  }
}
