/**
 * WhatsApp Outreach generation contract — Prospect Deployment Assets only.
 */

export const WHATSAPP_OUTREACH_GENERATION_RULES = `
WHATSAPP_OUTREACH formatting (required):
WHATSAPP_OUTREACH:
INITIAL MESSAGE
[message]

FOLLOW-UP
[follow-up message]

Rules for WhatsApp Outreach:
- Feel native to WhatsApp, not email.
- Concise, conversational, human, easy to answer.
- One specific reason for contacting this Prospect.
- One grounded observation from Prospect metadata or website intelligence.
- One low-friction CTA or question.
- No formal email salutation.
- No subject line.
- No signature block unless a very short sender identification is necessary.
- No long company biography.
- No corporate jargon.
- No invented prior relationship.
- No claim that the recipient previously requested information unless supported.
- No unsupported facts, inflated promises, or aggressive sales pressure.
- No markdown headings inside the message body.
- Avoid multiple CTAs and long paragraphs.
- Initial message target length: about 40–100 words.
- Follow-up should normally be shorter than the initial message.
- Adapt tone to Persona, Business Knowledge, Prospect category, and website positioning.
- Preserve ethical and regulated-industry constraints where applicable.
- Generate even when no WhatsApp number is present — this is content, not delivery.
`.trim();
