import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  deleteIntelligenceDomain,
  updateIntelligenceDomain,
} from "@/services/intelligenceDomainService";
import { getCommunityById } from "@/services/communityService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();
    const body = await request.json();

    const existing = await getCommunityById(id, organizationId);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Intelligence Domain not found" },
        { status: 404 },
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const description =
      typeof body.description === "string"
        ? body.description.trim() || null
        : body.description === null
          ? null
          : undefined;
    const market =
      typeof body.market === "string"
        ? body.market.trim() || null
        : body.market === null
          ? null
          : undefined;
    const status =
      typeof body.status === "string" ? body.status.trim() : undefined;
    const priority =
      typeof body.priority === "number"
        ? body.priority
        : typeof body.priority === "string" && body.priority.trim()
          ? Number(body.priority)
          : undefined;

    if (name === "") {
      return NextResponse.json(
        { success: false, error: "Name is required." },
        { status: 400 },
      );
    }

    const domain = await updateIntelligenceDomain(id, organizationId, {
      name,
      description,
      market,
      status,
      priority,
    });

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "Failed to update Intelligence Domain" },
        { status: 500 },
      );
    }

    revalidatePath("/intelligence-domains");
    revalidatePath(`/communities/${id}`);

    return NextResponse.json({ success: true, domain });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Intelligence Domain update failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to update Intelligence Domain" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { organizationId } = await requireCurrentOrganizationContext();

    const existing = await getCommunityById(id, organizationId);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Intelligence Domain not found" },
        { status: 404 },
      );
    }

    const result = await deleteIntelligenceDomain(id, organizationId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Failed to delete Intelligence Domain" },
        { status: 500 },
      );
    }

    revalidatePath("/intelligence-domains");
    revalidatePath(`/communities/${id}`);

    return NextResponse.json({
      success: true,
      softDeleted: result.softDeleted,
      message: result.softDeleted
        ? "Intelligence Domain disabled because linked discussions exist."
        : "Intelligence Domain deleted.",
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Intelligence Domain delete failed:", error);

    return NextResponse.json(
      { success: false, error: "Failed to delete Intelligence Domain" },
      { status: 500 },
    );
  }
}
