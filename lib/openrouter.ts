import {
  getReasoningProfile,
  isReasoningSupportedByModel,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterCallOptions = {
  temperature?: number;
  reasoningProfile?: ReasoningProfileType;
};

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options?: OpenRouterCallOptions,
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const appName = process.env.OPENROUTER_APP_NAME || "Athena";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable");
  }

  if (!model) {
    throw new Error("Missing OPENROUTER_MODEL environment variable");
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.2,
  };

  if (
    options?.reasoningProfile &&
    isReasoningSupportedByModel(model)
  ) {
    Object.assign(body, getReasoningProfile(options.reasoningProfile));
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": appName,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return data.choices?.[0]?.message?.content ?? "";
}
