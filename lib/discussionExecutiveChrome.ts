/**
 * Presentation chrome for Discussion Executive Intelligence.
 * Structural match for TenantMessages["discussions"]["executive"].
 * Does not resolve organization language or import tenantI18n.
 */
export type DiscussionExecutiveChrome = {
  heading: string;
  whatMatters: string;
  emptyDiscussion: string;
  selectionMissing: string;
  reasoningEmpty: string;
  historicalUnavailable: string;
  originalDiscussion: string;
  detailedReasoning: string;
  analysisStatusLabel: string;
  versionsTitle: string;
  versionsHelp: string;
  currentVersion: string;
  originalVersion: string;
  versionNumber: string;
  currentBadge: string;
  archivedBadge: string;
  generatedPrefix: string;
  hide: string;
  view: string;
  viewing: string;
  viewingArchived: string;
  currentVersionExpanded: string;
  archivedVersionExpanded: string;
  deploymentAssetsUnavailable: string;
  blueprintUnavailable: string;
  executiveInsight: string;
  primaryBuyerConcern: string;
  painPoints: string;
  recommendedStrategy: string;
  confidence: string;
  buyerStage: string;
  intent: string;
  risk: string;
  whyMatters: string;
  whyBuyerStage: string;
  whyPrimaryConcern: string;
  whyOpportunitySignal: string;
  whyRiskLevel: string;
  whyConfidence: string;
  recommendation: string;
  responseTiming: string;
  verdictWorthPursuing: string;
  verdictMonitor: string;
  verdictLowPriority: string;
  timingWithin12Hours: string;
  timingRespondToday: string;
  timingMonitor: string;
  generatedLabel: string;
  generationTimeLabel: string;
  modelLabel: string;
  todayAt: string;
  secondsOne: string;
  secondsMany: string;
  athenaModel: string;
  summary: string;
  sentiment: string;
  opportunity: string;
  opportunityTitle: string;
  opportunityReason: string;
  strategicRecommendation: string;
  recommendedAction: string;
  recommendationHelper: string;
  riskLevel: string;
  opportunityYes: string;
  opportunityNo: string;
  confidenceLow: string;
  confidenceMedium: string;
  confidenceHigh: string;
  analysisStatusDraft: string;
  analysisStatusReviewReady: string;
  analysisStatusNoOpportunity: string;
  analysisStatusOpportunityUnsaved: string;
  analysisStatusBriefingFailed: string;
  generationEyebrow: string;
  generating: string;
  generatingResumed: string;
  generatingResumedHelp: string;
  phaseUnderstanding: string;
  phaseBuilding: string;
  phaseCreatingAssets: string;
  phasePreparingBlueprint: string;
  estimatedTimeLabel: string;
  estimatedDuration: string;
  continueBrowsing: string;
  stillGenerating: string;
  stillGeneratingHelp: string;
  stillRunning: string;
  stillRunningHelp: string;
  toastTitle: string;
  toastBody: string;
  toastView: string;
  toastDismiss: string;
  generationFailed: string;
  generationInProgress: string;
  generationUnexpected: string;
  generationFailedLogs: string;
  generationUnknown: string;
};

export type DiscussionDetailChrome = {
  backToDiscussions: string;
  notFound: string;
  eyebrow: string;
  subtitle: string;
  labelPlatform: string;
  labelAuthor: string;
  labelDomain: string;
  labelLifecycle: string;
  labelOpportunityScore: string;
  labelThreadAge: string;
  labelSourceUrl: string;
  labelOriginalSentiment: string;
  labelDiscussion: string;
  labelTitle: string;
  emptyBody: string;
  emptyValue: string;
  threadUpdatesTitle: string;
  threadUpdatesEmpty: string;
  sourceUrlLink: string;
  workflowProgress: string;
  workflowAnalysis: string;
  workflowOpportunity: string;
  workflowBriefing: string;
  workflowAssets: string;
  workflowCurrentStatus: string;
  statusControlLabel: string;
  statusUpdated: string;
  statusUpdateFailed: string;
  generateIntelligence: string;
  generatingIntelligence: string;
  intelligenceGenerated: string;
  thinkDifferently: string;
  thinkingDifferently: string;
  thoughtDifferently: string;
  editDiscussion: string;
  cancelEdit: string;
  saveChanges: string;
  noDomainSelected: string;
  labelOriginalDiscussion: string;
  updateFailed: string;
  deleteConfirm: string;
  deleteFailed: string;
  appendTitle: string;
  appendHelp: string;
  appendField: string;
  appendPlaceholder: string;
  appendUrlOptional: string;
  appendUrlPlaceholder: string;
  appendCta: string;
  appendQueuing: string;
  appendProcessing: string;
  appendSuccess: string;
  appendFailed: string;
  appendUnexpected: string;
};

export function fillChromeTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

const ANALYSIS_STATUS_CHROME: Record<
  string,
  keyof Pick<
    DiscussionExecutiveChrome,
    | "analysisStatusDraft"
    | "analysisStatusReviewReady"
    | "analysisStatusNoOpportunity"
    | "analysisStatusOpportunityUnsaved"
    | "analysisStatusBriefingFailed"
  >
> = {
  draft: "analysisStatusDraft",
  review_ready: "analysisStatusReviewReady",
  analysis_completed_no_opportunity: "analysisStatusNoOpportunity",
  analysis_completed_opportunity_unsaved: "analysisStatusOpportunityUnsaved",
  briefing_save_failed: "analysisStatusBriefingFailed",
};

export function presentAnalysisStatus(
  status: string | null | undefined,
  chrome?: DiscussionExecutiveChrome | null,
): string {
  const token = String(status ?? "").trim();
  if (!token) {
    return "";
  }
  if (!chrome) {
    return token;
  }
  const key = ANALYSIS_STATUS_CHROME[token];
  return key ? chrome[key] : token;
}
