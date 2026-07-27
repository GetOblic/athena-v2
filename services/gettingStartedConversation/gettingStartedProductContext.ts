/**
 * Server-owned Getting Started product context.
 * Derived only from current authoritative user-facing Athena behavior.
 * Do not invent undocumented capabilities.
 */

export type GettingStartedProductTopicId =
  | "getting_started_workflow"
  | "identity"
  | "voice"
  | "business_knowledge"
  | "homepage_learning"
  | "deep_website_learning"
  | "discussions"
  | "opportunities"
  | "executive_briefings"
  | "strategic_blueprint"
  | "deployment_assets"
  | "executive_versions"
  | "stored_vs_generated"
  | "workflow_ordering"
  | "how_athena_uses_context";

export type GettingStartedProductTopic = {
  id: GettingStartedProductTopicId;
  title: string;
  summary: string;
};

/**
 * Authoritative product explanations verified against:
 * - app/getting-started/page.tsx
 * - app/identity/page.tsx
 * - components/identity/IdentityExecutiveIntelligence.tsx
 * - app/page.tsx
 * - components/dashboard/DashboardSidebar.tsx
 */
export const GETTING_STARTED_PRODUCT_TOPICS: readonly GettingStartedProductTopic[] =
  [
    {
      id: "getting_started_workflow",
      title: "Getting Started workflow",
      summary:
        "Athena is presented as an AI Market Intelligence Partner. Getting Started guides users through training Athena Brain, adding conversations, reviewing discussions, reviewing opportunities, reading briefings, using Deployment Assets, and using Strategic Asset Blueprints. The documented flow is: Conversation → Athena Analysis → Opportunity Detection → Executive Intelligence → Deployment Assets → Strategic Asset Blueprint → Business Growth.",
    },
    {
      id: "identity",
      title: "Identity / Athena Brain",
      summary:
        "Identity (Athena Brain at /identity) is where users teach Athena their voice, expertise, business knowledge, website, and professional rules. Athena uses this when generating replies, CTAs, briefings, and strategic asset blueprints. Brain Status tracks Voice learned, Expertise learned, Homepage learned, Professional terminology learned, and continuous learning.",
    },
    {
      id: "voice",
      title: "Voice",
      summary:
        "Voice (Your Voice / about_you) helps Athena understand how the user naturally communicates — thinking, speaking, teaching, and guiding. It is distinct from Business Knowledge. Best practice guidance says train Athena before importing discussions.",
    },
    {
      id: "business_knowledge",
      title: "Business Knowledge",
      summary:
        "Business Knowledge (expertise) teaches Athena methodology, frameworks, FAQs, terminology, offers, and professional rules. It is the business-expertise counterpart to Voice, not the same field.",
    },
    {
      id: "homepage_learning",
      title: "Homepage learning",
      summary:
        "During Train Athena, Athena studies the business website homepage. Brain Status reflects whether homepage learning is present. Homepage learning contributes stored website understanding used by Athena Brain.",
    },
    {
      id: "deep_website_learning",
      title: "Deep website learning",
      summary:
        "After training, users can run Deep Scrape Website for multi-page learning beyond the homepage. Deep scrape availability is tied to a ready brain and a configured website. It expands website evidence Athena can use for business understanding when the user initiates the scrape.",
    },
    {
      id: "discussions",
      title: "Discussions",
      summary:
        "Users import relevant conversations or discussions into Athena via Inbox (for example from Facebook, Instagram, Reddit, LinkedIn, email, support conversations, interviews, or meeting notes). Athena analyzes that material, identifies signals and opportunities, and shows intent, buyer concern, opportunity signals, and recommended next steps in plain language on Discussions.",
    },
    {
      id: "opportunities",
      title: "Opportunities",
      summary:
        "Opportunities filters the most valuable imported discussions so users can focus on conversations most likely to turn into business. Dashboard and Getting Started both surface opportunity review as a core step. Best practice: review Opportunities daily.",
    },
    {
      id: "executive_briefings",
      title: "Executive Briefings",
      summary:
        "Briefings summarize the most important insights and strategy for each opportunity — like a concise executive summary users can act on quickly. Dashboard metrics include draft and approved briefings.",
    },
    {
      id: "strategic_blueprint",
      title: "Strategic Asset Blueprint",
      summary:
        "Strategic Asset Blueprints are reusable asset prompts for PDFs, images, carousels, lead magnets, and educational content. Create once, reuse across marketing channels. Best practice: reuse Strategic Asset Blueprints across channels.",
    },
    {
      id: "deployment_assets",
      title: "Deployment Assets",
      summary:
        "Deployment Assets are copy-ready replies, private messages, follow-ups, calls to action, and social posts generated for the user and ready to paste into platforms, email, or DMs. Best practice: use Deployment Assets instead of writing manually.",
    },
    {
      id: "executive_versions",
      title: "Executive Versions",
      summary:
        "In prospect and discussion Executive Intelligence workspaces, Athena can work with Current or Archived Executive Versions of generated intelligence and assets. Conversation about a prospect can target a selected Executive Version when one exists. Getting Started does not itself load Executive Version records.",
    },
    {
      id: "stored_vs_generated",
      title: "Stored business knowledge vs generated intelligence",
      summary:
        "Stored business profile content (Voice, Business Knowledge, website learning, Identity Executive Intelligence understanding) is what Athena learns about the user's business on Identity. Generated intelligence (discussion analysis, opportunities, briefings, Deployment Assets, Strategic Blueprints, Executive Versions) is produced from imported market conversations and workflows after Athena has business context. Identity Executive Intelligence explains what Athena currently understands about the business; it is separate from prospect/discussion Executive Intelligence outputs.",
    },
    {
      id: "workflow_ordering",
      title: "Recommended workflow ordering",
      summary:
        "Verified ordering from Getting Started: (1) Train Athena Brain, (2) Add Conversations / Inbox, (3) Review Discussions, (4) Review Opportunities, (5) Read Briefings, (6) Use Deployment Assets, (7) Use Strategic Asset Blueprints. Best practices emphasize training before importing discussions and continuing to feed Athena new conversations.",
    },
    {
      id: "how_athena_uses_context",
      title: "How Athena uses business context",
      summary:
        "Once trained, Athena uses Voice, expertise, website learning, and professional rules so replies, briefings, and asset blueprints reflect the user's business rather than a generic assistant. Users import relevant conversations or discussions into Athena. Athena analyzes that material, identifies signals and opportunities, and uses the resulting intelligence to support strategic outputs. Athena helps users understand market conversations when the user supplies or imports the discussion material. Athena does not crawl the open web on its own, continuously search markets, or pull social-platform discussions without user import.",
    },
  ] as const;

export const GETTING_STARTED_PRODUCT_CONTEXT_VERSION = "v12-getting-started-1";

export function formatGettingStartedProductContext(): string {
  return GETTING_STARTED_PRODUCT_TOPICS.map((topic) => {
    return `[${topic.id}] ${topic.title}\n${topic.summary}`;
  }).join("\n\n");
}

export function getGettingStartedProductTopic(
  id: GettingStartedProductTopicId,
): GettingStartedProductTopic | undefined {
  return GETTING_STARTED_PRODUCT_TOPICS.find((topic) => topic.id === id);
}
