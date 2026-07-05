import { callOpenRouter } from "@/lib/openrouter";

export async function generateReview(prompt: string) {
    return callOpenRouter([
        {
            role: "system",
            content:
                "You are Athena, an institutional intelligence analyst. Produce concise, professional business intelligence."
        },
        {
            role: "user",
            content: prompt
        }
    ]);
}