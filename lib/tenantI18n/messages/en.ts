/**
 * Canonical English tenant presentation dictionary.
 * Structural source of truth for TenantMessages.
 * Localizes application chrome only — never generated or persisted content.
 */
export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    loading: "Loading…",
    retry: "Retry",
    close: "Close",
    copy: "Copy",
    copied: "Copied",
    edit: "Edit",
    delete: "Delete",
    back: "Back",
    confirmDelete: "Confirm Delete",
    deleting: "Deleting...",
    confirmDeletion: "Confirm deletion",
  },
  chrome: {
    poweredByGetOblic: "Powered by GetOblic",
    tagline: "Intelligence OS",
    logOut: "Log out",
    sessionActions: "Session actions",
  },
  nav: {
    dashboard: "Dashboard",
    gettingStarted: "Getting Started",
    athenaBrain: "Athena Brain",
    intelligenceDomains: "Intelligence Domains",
    inbox: "Inbox",
    discussions: "Discussions",
    prospects: "Prospects",
    personas: "Personas",
    ads: "Ads",
    seoIntelligence: "SEO Intelligence",
    socialPlanner: "Social Planner",
    opportunities: "Opportunities",
    briefings: "Briefings",
  },
  status: {
    new: "New",
    draft: "Draft",
    completed: "Completed",
    failed: "Failed",
    inProgress: "In Progress",
  },
  conversation: {
    askAthena: "Ask Athena",
    clearConversation: "Clear conversation",
    you: "You",
    athena: "Athena",
    thinking: "Athena is thinking…",
    tryAsking: "Try asking",
    asking: "Asking…",
    enterToSend: "Enter to send · Shift+Enter for a new line",
    supportReference: "Support reference:",
  },
  errors: {
    somethingWentWrong: "Something went wrong. Please try again.",
    tryAgain: "Please try again.",
    unableToLoad: "Unable to load",
  },
} as const;
