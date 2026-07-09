import { NextResponse } from "next/server";
import { generateReview } from "@/services/aiService";
import {
  OrganizationAccessError,
  requireCurrentOrganizationContext,
} from "@/services/organizationService";

export async function POST(request: Request) {
  try {
    await requireCurrentOrganizationContext();

    const body = await request.json();

    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid prompt",
        },
        { status: 400 },
      );
    }

    const review = await generateReview(prompt, {
      stage: "generic_review",
      promptSource: "app/api/ai/review/route.ts",
      generationKind: "generic_review",
    });

    return NextResponse.json({
      success: true,
      review,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    console.error("Athena review generation failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate Athena review",
      },
      { status: 500 },
    );
  }
}
