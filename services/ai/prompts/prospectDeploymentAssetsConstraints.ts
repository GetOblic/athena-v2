/**
 * Prospect-specific deployment asset section labels (MVP set).
 * Used only when discussion.platform === prospect_intelligence.
 */

/**
 * Always-generate Prospect extras.
 * Requested on every Prospect run; excluded from REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS
 * so they do not control Ready / publication completeness.
 */
export const OPTIONAL_PROSPECT_DEPLOYMENT_ASSET_KEYS = [
  "WHATSAPP_OUTREACH",
  "KNOWLEDGE_BASE_ENHANCEMENT",
  "HIDDEN_GEMS",
  "SUBSTACK_POST",
  "SUBSTACK_NOTE",
  "REDDIT_POST",
  "SKOOL_POST",
  "SKOOL_COURSE_IDEA",
  "SOCIAL_VOICE_POST",
  "SHORT_VIDEO_PROMPT",
  "VISUAL_MESSAGE_PROMPT",
  "LOCAL_OUTREACH_IMAGE_PROMPT",
] as const;

export const PROSPECT_DEPLOYMENT_SECTION_LABELS = `
PERSONALIZED_OUTREACH_EMAIL:
FOLLOW_UP_EMAIL:
LINKEDIN_CONNECTION:
LINKEDIN_FOLLOW_UP:
COLD_CALL_OPENING:
DISCOVERY_QUESTIONS:
PERSONALIZED_VALUE_PROPOSITION:
OBJECTION_ANTICIPATION:
MEETING_PREPARATION:
RECOMMENDED_CTA:
FOLLOW_UP_SEQUENCE:
PERSONALIZED_VIDEO_SCRIPT:
NEWSLETTER_IDEA:
BLOG_POST_IDEA:
WHATSAPP_OUTREACH:
KNOWLEDGE_BASE_ENHANCEMENT:
HIDDEN_GEMS:
SUBSTACK_POST:
SUBSTACK_NOTE:
REDDIT_POST:
SKOOL_POST:
SKOOL_COURSE_IDEA:
SOCIAL_VOICE_POST:
SHORT_VIDEO_PROMPT:
VISUAL_MESSAGE_PROMPT:
LOCAL_OUTREACH_IMAGE_PROMPT:
`.trim();

export const PROSPECT_DEPLOYMENT_CHANNEL_GUIDE = `
PERSONALIZED_OUTREACH_EMAIL — concise outbound email tailored to this prospect; specific hook from homepage/fields. Must read like email.
FOLLOW_UP_EMAIL — short second-touch email referencing prior outreach angle.
LINKEDIN_CONNECTION — connection request note; personalized LinkedIn tone; hard maximum 200 characters including spaces and punctuation.
LINKEDIN_FOLLOW_UP — post-accept LinkedIn message with one clear ask; hard maximum 200 characters including spaces and punctuation.
COLD_CALL_OPENING — first 15–20 seconds of a cold call; natural, not scripted-sounding.
DISCOVERY_QUESTIONS — 5–8 sharp discovery questions for a first conversation.
PERSONALIZED_VALUE_PROPOSITION — one crisp value prop unique to this prospect.
OBJECTION_ANTICIPATION — likely objections and concise responses.
MEETING_PREPARATION — briefing bullets for a seller before a meeting.
RECOMMENDED_CTA — one paste-ready next-step CTA.
FOLLOW_UP_SEQUENCE — 3–5 touch sequence outline (channels + intent only; no automation).
PERSONALIZED_VIDEO_SCRIPT — 45–60 second personalized video script.
NEWSLETTER_IDEA — concept for the Athena client's audience newsletter (not outreach to a prospect): subject/title, central angle, why relevant now, key points/sections, suggested CTA, optional opening hook.
BLOG_POST_IDEA — concept for the Athena client's audience blog (not a full article): proposed title, search/reader intent, central thesis, recommended outline, key expert insights, suggested CTA, optional differentiation angle.
WHATSAPP_OUTREACH — native WhatsApp outreach (not email). Include INITIAL MESSAGE and FOLLOW-UP sublabels. Conversational, concise, one grounded observation, one low-friction question. No subject line, no signature block, no formal salutation.
KNOWLEDGE_BASE_ENHANCEMENT — structured factual operational knowledge for Voice AI / listings / support. Verified facts only; omit unknowns; no marketing copy.
HIDDEN_GEMS — non-obvious analyst findings from the complete learned website corpus (Finding / Why it matters / Opportunity). Not a website summary.
SUBSTACK_POST — publication-ready long-form editorial Substack article (TITLE, SUBTITLE, POST, CLOSING CTA). Not SEO or sales copy.
SUBSTACK_NOTE — concise insight-led Substack Note ready for the feed; not a full newsletter or advertisement.
REDDIT_POST — authentic Reddit discussion starter (SUGGESTED TITLE, POST, optional DISCUSSION QUESTION). Transparent and community-native.
SKOOL_POST — ready-to-publish Skool general-discussion post (Title / Post). Discussion-oriented, not promotional.
SKOOL_COURSE_IDEA — prospect-specific Skool course concept (Course Name, Short Description, Course Concept, Recommended Modules, Practical Outcome).
SOCIAL_VOICE_POST — first-person social post in the Athena client's Voice, speaking to the Prospect market signal as lived observation (not a sales template).
SHORT_VIDEO_PROMPT — paste-ready ~8s AI video generation prompt; cinematic; brand creative direction; prompt only.
VISUAL_MESSAGE_PROMPT — paste-ready single-image AI generation prompt; one message/emotion; brand creative direction; prompt only.
LOCAL_OUTREACH_IMAGE_PROMPT — paste-ready realistic local-community image prompt using Prospect location when available; prompt only.
`.trim();

export const PROSPECT_DEPLOYMENT_ASSET_KEYS = [
  "PERSONALIZED_OUTREACH_EMAIL",
  "FOLLOW_UP_EMAIL",
  "LINKEDIN_CONNECTION",
  "LINKEDIN_FOLLOW_UP",
  "COLD_CALL_OPENING",
  "DISCOVERY_QUESTIONS",
  "PERSONALIZED_VALUE_PROPOSITION",
  "OBJECTION_ANTICIPATION",
  "MEETING_PREPARATION",
  "RECOMMENDED_CTA",
  "FOLLOW_UP_SEQUENCE",
  "PERSONALIZED_VIDEO_SCRIPT",
  "NEWSLETTER_IDEA",
  "BLOG_POST_IDEA",
  "WHATSAPP_OUTREACH",
  "KNOWLEDGE_BASE_ENHANCEMENT",
  "HIDDEN_GEMS",
  "SUBSTACK_POST",
  "SUBSTACK_NOTE",
  "REDDIT_POST",
  "SKOOL_POST",
  "SKOOL_COURSE_IDEA",
  "SOCIAL_VOICE_POST",
  "SHORT_VIDEO_PROMPT",
  "VISUAL_MESSAGE_PROMPT",
  "LOCAL_OUTREACH_IMAGE_PROMPT",
  // Backward-compatible aliases still parsed if older drafts exist.
  "COLD_EMAIL",
  "OBJECTION_HANDLING",
] as const;

export type ProspectDeploymentAssetKey =
  (typeof PROSPECT_DEPLOYMENT_ASSET_KEYS)[number];

export const PROSPECT_DEPLOYMENT_ASSET_META: Record<
  ProspectDeploymentAssetKey,
  { title: string; objective: string }
> = {
  PERSONALIZED_OUTREACH_EMAIL: {
    title: "Personalized Outreach Email",
    objective: "Outbound email ready to send to this prospect.",
  },
  FOLLOW_UP_EMAIL: {
    title: "Follow-up Email",
    objective: "Second-touch email after initial outreach.",
  },
  LINKEDIN_CONNECTION: {
    title: "LinkedIn Connection Message",
    objective: "Connection request note tailored to this prospect.",
  },
  LINKEDIN_FOLLOW_UP: {
    title: "LinkedIn Follow-up",
    objective: "Post-accept LinkedIn message with a clear next step.",
  },
  COLD_CALL_OPENING: {
    title: "Cold Call Opening",
    objective: "Opening lines for a cold call.",
  },
  DISCOVERY_QUESTIONS: {
    title: "Discovery Questions",
    objective: "Questions to qualify and uncover needs.",
  },
  PERSONALIZED_VALUE_PROPOSITION: {
    title: "Personalized Value Proposition",
    objective: "Value proposition unique to this prospect.",
  },
  OBJECTION_ANTICIPATION: {
    title: "Objection Anticipation",
    objective: "Likely objections and concise responses.",
  },
  MEETING_PREPARATION: {
    title: "Meeting Preparation",
    objective: "Seller prep briefing before a meeting.",
  },
  RECOMMENDED_CTA: {
    title: "Recommended CTA",
    objective: "Exact next-step CTA sentence.",
  },
  FOLLOW_UP_SEQUENCE: {
    title: "Follow-up Sequence",
    objective: "Multi-touch follow-up sequence outline.",
  },
  PERSONALIZED_VIDEO_SCRIPT: {
    title: "Personalized Video Script",
    objective: "Short personalized video script.",
  },
  NEWSLETTER_IDEA: {
    title: "Newsletter Idea",
    objective:
      "Concept for the Athena client's audience newsletter — not prospect outreach.",
  },
  BLOG_POST_IDEA: {
    title: "Blog Post Idea",
    objective:
      "Concept for the Athena client's audience blog — not a full article or prospect outreach.",
  },
  WHATSAPP_OUTREACH: {
    title: "WhatsApp Outreach",
    objective:
      "Native WhatsApp initial message and follow-up — conversational, not email-formatted.",
  },
  KNOWLEDGE_BASE_ENHANCEMENT: {
    title: "Knowledge Base Enhancement",
    objective:
      "Structured factual business knowledge for listings, support, and voice AI.",
  },
  HIDDEN_GEMS: {
    title: "Hidden Gems",
    objective:
      "Non-obvious business intelligence from the complete learned website corpus.",
  },
  SUBSTACK_POST: {
    title: "Substack Post",
    objective:
      "Publication-ready long-form thought leadership for Substack.",
  },
  SUBSTACK_NOTE: {
    title: "Substack Note",
    objective:
      "Concise insight-led Substack Note ready to publish in the feed.",
  },
  REDDIT_POST: {
    title: "Reddit Post",
    objective:
      "Transparent, community-native discussion content for Reddit.",
  },
  SKOOL_POST: {
    title: "Skool Post",
    objective:
      "Ready-to-publish Skool community discussion post.",
  },
  SKOOL_COURSE_IDEA: {
    title: "Skool Course Idea",
    objective:
      "Prospect-specific Skool course concept grounded in demonstrated expertise.",
  },
  SOCIAL_VOICE_POST: {
    title: "Social Voice Post",
    objective:
      "First-person social post in the client's Voice addressing the Prospect market signal.",
  },
  SHORT_VIDEO_PROMPT: {
    title: "Short Video Prompt",
    objective:
      "Paste-ready AI video generation prompt (~8s, cinematic, social-friendly).",
  },
  VISUAL_MESSAGE_PROMPT: {
    title: "Visual Message Prompt",
    objective:
      "Paste-ready single-image AI generation prompt — one message, one emotion.",
  },
  LOCAL_OUTREACH_IMAGE_PROMPT: {
    title: "Local Outreach Image Prompt",
    objective:
      "Paste-ready realistic local-community image prompt for Prospect outreach.",
  },
  COLD_EMAIL: {
    title: "Personalized Outreach Email",
    objective: "Outbound email ready to send to this prospect.",
  },
  OBJECTION_HANDLING: {
    title: "Objection Anticipation",
    objective: "Likely objections and concise responses.",
  },
};
