/**
 * Server-owned Getting Started product context.
 * Derived only from current authoritative user-facing Athena V2 behavior.
 * Do not invent undocumented capabilities.
 */

export type GettingStartedProductTopicId =
  | "athena_v2_overview"
  | "four_outcomes"
  | "home_vs_help"
  | "athena_brain"
  | "train_retrain"
  | "website_intelligence"
  | "audiences"
  | "advertising"
  | "social_planner"
  | "prospects"
  | "observations"
  | "refresh_intelligence"
  | "alternative_approach"
  | "discuss_ask"
  | "statuses_retry"
  | "saved_work";

export type GettingStartedProductTopic = {
  id: GettingStartedProductTopicId;
  title: string;
  summary: string;
};

/**
 * Authoritative product explanations verified against current V2 surfaces:
 * Identity, Home, Visibility, Audiences, Advertising, Social Planner, Prospects.
 */
export const GETTING_STARTED_PRODUCT_TOPICS: readonly GettingStartedProductTopic[] =
  [
    {
      id: "athena_v2_overview",
      title: "Athena V2 Help Center",
      summary:
        "Athena is an intelligence OS that learns a business, then helps the user define the business, build visibility, generate traction, and convert opportunities. Users teach, correct, and point Athena. Athena researches, analyzes, and generates in the background. Users review the result and guide the next step. This assistant explains how Athena works. It does not load the user's business data or change anything.",
    },
    {
      id: "four_outcomes",
      title: "Four business outcomes",
      summary:
        "The current operating model is: (1) Define Your Business on /identity through Athena Brain, (2) Build Visibility on /seo, (3) Generate Traction through Audiences, Advertising, and Social Content, (4) Convert Opportunities through Prospects. Inbox, Discussions, Opportunities, and Briefings are not the current onboarding path.",
    },
    {
      id: "home_vs_help",
      title: "Home vs Help Center",
      summary:
        "Home answers what the user should do right now from live workspace state. The Help Center at /getting-started explains what Athena is and how it works. This assistant must not invent live next-step recommendations from business data because it does not load that data.",
    },
    {
      id: "athena_brain",
      title: "Athena Brain",
      summary:
        "Athena Brain, also called Business Brain, lives on Identity at /identity. It is the trusted company context used by Visibility, Audiences, Advertising, Social Content, and Prospects. Users teach Voice, Business Knowledge, and the business website. Identity has no observation workflow.",
    },
    {
      id: "train_retrain",
      title: "Train and Retrain",
      summary:
        "Identity edits do not update Athena Brain until the user chooses Train or Retrain. Train writes the Brain the first time. Retrain rebuilds it after Voice, Business Knowledge, or website changes. A successful Identity Deep Scrape retrains Athena Brain automatically as part of that workflow. The user does not need a second manual Retrain after Deep Scrape completes.",
    },
    {
      id: "website_intelligence",
      title: "Website intelligence and Deep Scrape",
      summary:
        "During Train, Athena can study the business homepage. Deep Scrape on Identity studies more pages of the user's own website, needs a Ready Brain plus a website, and automatically retrains Athena Brain as part of the Deep Scrape workflow. Research this website on an Audience studies an optional reference URL about the segment. On a Prospect it studies that business's own site and participates in follow-on intelligence. Prospects without a website cannot generate useful intelligence until a site is added.",
    },
    {
      id: "audiences",
      title: "Audiences",
      summary:
        "An Audience is the segment or person the user wants to reach. The library is /personas. Users can create one manually, import a CSV, ask Athena to suggest one from Athena Brain, or create one from a Prospect after that Prospect's intelligence is Ready. Audience profile save does not itself regenerate intelligence. Older screens may say Persona; that means Audience.",
    },
    {
      id: "advertising",
      title: "Advertising",
      summary:
        "Advertising at /ads generates saved campaigns. Users can target one Audience or generate without selecting an Audience. Athena still uses Athena Brain and available saved audiences. A Ready campaign stays unchanged. Create another version starts a new campaign. Failed campaigns can be retried in place.",
    },
    {
      id: "social_planner",
      title: "Social Planner",
      summary:
        "Social Content at /social-planner plans one week of posts. Users may select an Audience or leave it unselected. Try another approach creates a different week version. Ask Athena is read-only until the user chooses Apply Athena's Suggestions, which creates a revised week and keeps the previous one. A failed week is started again as a new week.",
    },
    {
      id: "prospects",
      title: "Prospects",
      summary:
        "A Prospect is one specific business the user may pursue, not an audience segment. The primary path is Find opportunities at /prospects/find using the GetOblic Directory or Google. Users can also add a business themselves. Completeness and Opportunity Score are evidence signals, not a ranking of who to pursue. GetOblic Directory holds consume listing capacity; releasing a listing frees capacity.",
    },
    {
      id: "observations",
      title: "Observations",
      summary:
        "An observation adds real-world evidence. On an Audience it appends to notes and queues new intelligence. On a Prospect, add and refresh does the same. Identity has no observation workflow.",
    },
    {
      id: "refresh_intelligence",
      title: "Refresh intelligence",
      summary:
        "Refresh creates new intelligence from current evidence and preserves previous intelligence. Meaningful Prospect edits may queue a refresh. Audience profile save does not. Use refresh after observations, website research, or corrected facts.",
    },
    {
      id: "alternative_approach",
      title: "Try another approach",
      summary:
        "Try another approach, also called Think Differently in some product language, asks Athena for a different strategic interpretation of the same evidence. Audience, Prospect, and Social Planner support this. Advertising uses Create another version instead, which creates a new campaign row.",
    },
    {
      id: "discuss_ask",
      title: "Discuss and Ask Athena",
      summary:
        "Discuss and Ask Athena explain the current object and are read-only. They do not save, scrape, generate, or change the underlying object unless a surface explicitly offers Apply. Social Planner's Apply Athena's Suggestions is the documented exception.",
    },
    {
      id: "statuses_retry",
      title: "Ready, Failed, Retry, and working status",
      summary:
        "Generation can continue after the user leaves the page. Ready means the result can be used. Failed means retry on that object when Retry exists. Working status is the user's pipeline label and is separate from intelligence readiness. Changing working status does not generate intelligence.",
    },
    {
      id: "saved_work",
      title: "Where Athena saves work",
      summary:
        "Athena Brain is saved on Identity. Visibility analyses are saved in Visibility. Audiences are saved on /personas. Campaigns are saved on /ads. Social weeks are saved on /social-planner. Prospects are saved on /prospects. Open the matching module to find work Athena already created.",
    },
  ] as const;

export const GETTING_STARTED_PRODUCT_CONTEXT_VERSION = "v2-help-center-1";

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
