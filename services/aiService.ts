import { callOpenRouter } from "@/lib/openrouter";
import {
  logLlmCallEnd,
  logLlmCallStart,
  type LlmCallMeta,
} from "@/lib/regenerationDiagnostics";

export async function generateReview(
  prompt: string,
  meta?: LlmCallMeta,
) {
  const startedAt = meta ? logLlmCallStart(meta) : 0;
  const content = await callOpenRouter([
    {
      role: "system",
      content:
        "You are Athena, an institutional intelligence analyst. Produce concise, professional business intelligence.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  if (meta) {
    logLlmCallEnd(meta, startedAt, content.length);
  }

  return content;
}
