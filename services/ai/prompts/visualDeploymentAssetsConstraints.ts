/**
 * Visual Deployment Assets — generation prompts for video/image tools.
 * Shared: SHORT_VIDEO_PROMPT, VISUAL_MESSAGE_PROMPT
 * Prospect-only: LOCAL_OUTREACH_IMAGE_PROMPT
 */

export const SHARED_VISUAL_DEPLOYMENT_ASSET_KEYS = [
  "SHORT_VIDEO_PROMPT",
  "VISUAL_MESSAGE_PROMPT",
] as const;

export const PROSPECT_ONLY_VISUAL_DEPLOYMENT_ASSET_KEYS = [
  "LOCAL_OUTREACH_IMAGE_PROMPT",
] as const;

export const SHORT_VIDEO_PROMPT_GENERATION_RULES = `
SHORT_VIDEO_PROMPT formatting (required):
SHORT_VIDEO_PROMPT:
[single ready-to-paste AI video generation prompt only]

Rules for Short Video Prompt:
- Write one production-ready prompt for generators such as Google Veo, Runway, Kling, Pika, and similar tools.
- Target approximately 8 seconds; immediate hook; strong opening visual; one clear message.
- Cinematic, emotionally engaging, premium production quality, fast pacing, professional camera movement.
- Realistic, natural lighting, vertical/social-friendly framing, commercial quality, high visual impact.
- Apply the Visual Brand Creative Direction from this prompt — translate brand identity into aesthetic direction (e.g. luxury editorial, modern Apple-style minimalism, premium medical aesthetics). Do not merely list hex colors.
- When brand direction is unavailable, use a premium neutral aesthetic.
- When the target generator supports negative guidance, naturally include concise negative prompt language that avoids AI-looking faces, plastic skin, distorted anatomy, unrealistic hands, low realism, visual artifacts, poor lighting, and low-quality rendering.
- Avoid unnecessary narration and avoid editing instructions (no cut lists, timelines, or post-production steps).
- Output ONLY the generation prompt under SHORT_VIDEO_PROMPT. No explanation, no concepts, no suggestions.
`.trim();

export const VISUAL_MESSAGE_PROMPT_GENERATION_RULES = `
VISUAL_MESSAGE_PROMPT formatting (required):
VISUAL_MESSAGE_PROMPT:
[single ready-to-paste AI image generation prompt only]

Rules for Visual Message Prompt:
- Write one premium image-generation prompt for GPT Image, Midjourney, Imagen, Flux, and similar tools.
- One image, one message, one emotion, one takeaway — not an infographic, comparison, presentation, carousel, or slide.
- Premium, minimal, realistic, high impact, editorial quality, commercial photography, social-media friendly, emotionally memorable.
- Apply the Visual Brand Creative Direction from this prompt as aesthetic direction, not a raw color dump. If unavailable, use premium neutral styling.
- When the generator supports negative guidance, naturally discourage AI artifacts, plastic skin, distorted hands, unrealistic anatomy, fake lighting, oversharpening, excessive HDR, and low realism.
- Output ONLY the prompt under VISUAL_MESSAGE_PROMPT. No explanation, no concepts, no suggestions.
`.trim();

export const LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES = `
LOCAL_OUTREACH_IMAGE_PROMPT formatting (Prospect only — required on every Prospect run):
LOCAL_OUTREACH_IMAGE_PROMPT:
[single ready-to-paste AI image generation prompt only]

Rules for Local Outreach Image Prompt:
- Write one highly realistic image-generation prompt showing the Athena client naturally engaging with the Prospect's local community.
- Use available Prospect fields when present: business name, category, address, city, state, country.
- Scene must feel native to the Prospect's own community (e.g. downtown walk, coffee meeting, neighboring businesses, street networking, walking toward the Prospect location).
- Documentary / DSLR commercial photography: authentic streets and architecture, natural lighting, natural human interaction, real-world composition, documentary realism.
- Location fallback: use full address when available; otherwise city; otherwise city + state; never invent specific landmarks or street addresses that were not provided.
- Apply Visual Brand Creative Direction as aesthetic direction when available; otherwise premium neutral documentary realism.
- When the generator supports negative guidance, naturally discourage AI look, plastic skin, fantasy, cartoon, illustration, 3D render, surrealism, and unrealistic anatomy.
- Output ONLY the prompt under LOCAL_OUTREACH_IMAGE_PROMPT. No explanation, no concepts, no suggestions.
`.trim();

export const VISUAL_DEPLOYMENT_ASSETS_SHARED_RULES = `
Visual Deployment Assets (production prompts):
- SHORT_VIDEO_PROMPT and VISUAL_MESSAGE_PROMPT are paste-ready generator prompts — not scripts, strategies, or explanations.
- LOCAL_OUTREACH_IMAGE_PROMPT is Prospect-only.
- Do not wrap visual prompts in quotation marks unless required by the generator syntax inside the prompt itself.
- Do not add preamble such as "Here is a prompt" or trailing commentary.
`.trim();
