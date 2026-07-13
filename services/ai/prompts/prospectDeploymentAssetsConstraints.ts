/**
 * Prospect-specific deployment asset section labels (MVP set).
 * Used only when discussion.platform === prospect_intelligence.
 */

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
`.trim();

export const PROSPECT_DEPLOYMENT_CHANNEL_GUIDE = `
PERSONALIZED_OUTREACH_EMAIL — concise outbound email tailored to this prospect; specific hook from homepage/fields.
FOLLOW_UP_EMAIL — short second-touch email referencing prior outreach angle.
LINKEDIN_CONNECTION — connection request note under character limits; personalized.
LINKEDIN_FOLLOW_UP — post-accept LinkedIn message with one clear ask.
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
  COLD_EMAIL: {
    title: "Personalized Outreach Email",
    objective: "Outbound email ready to send to this prospect.",
  },
  OBJECTION_HANDLING: {
    title: "Objection Anticipation",
    objective: "Likely objections and concise responses.",
  },
};
