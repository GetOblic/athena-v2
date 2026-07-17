/**
 * Skool Post — Prospect Deployment Asset generation contract.
 */

export const SKOOL_POST_GENERATION_RULES = `
SKOOL POST formatting:
SKOOL_POST:
Title:
[post title]

Post:
[ready-to-publish Skool general-discussion post]

Rules for Skool Post:
- Ready-to-publish general discussion post for a Skool community.
- Useful, discussion-oriented, easy to scan, relevant to the prospect’s expertise or audience.
- Written to encourage genuine comments and participation.
- Educational or thought-provoking rather than promotional.
- Suitable for a General Discussion area; ready to publish without strategic rewriting.
- Clear, relevant title; open with a strong observation, problem, lesson, or question.
- Provide practical value or a useful perspective; short paragraphs or concise bullets where helpful.
- Invite members to contribute experiences or opinions.
- Avoid cold sales tone, excessive emojis, unnecessary hashtags, invented authority claims, or unsupported statistics.
- Output ONLY Title/Post structure — no explanation outside the final asset.
- Must be materially different from Reddit Post, Substack Note, Substack Post, and Social Voice Post.
- Ground in Prospect context and learned website intelligence without inventing facts.
`.trim();
