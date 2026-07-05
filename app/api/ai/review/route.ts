import { NextResponse } from "next/server";
import { generateReview } from "@/services/aiService";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid prompt",
        },
        { status: 400 }
      );
    }

    const review = await generateReview(prompt);

    return NextResponse.json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Athena review generation failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate Athena review",
      },
      { status: 500 }
    );
  }
}
