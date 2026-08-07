/**
 * Deterministic Account Readiness for Master dashboard cards.
 * Computed at read time from existing operational signals only — no AI.
 */

export type LicenseeAccountReadinessSignals = {
  brainReady: boolean;
  websiteIntelligenceReady: boolean;
  seoReady: boolean;
  adsReady: boolean;
  hasPersonas: boolean;
  hasProspects: boolean;
};

export type LicenseeAccountReadinessDimension = {
  key:
    | "brain"
    | "website"
    | "seo"
    | "ads"
    | "personas"
    | "prospects";
  label: string;
  ready: boolean;
};

export type LicenseeAccountReadiness = {
  percent: number;
  readyCount: number;
  totalCount: number;
  dimensions: LicenseeAccountReadinessDimension[];
};

/** Equal-weight operational completeness across six existing signals. */
export function computeAccountReadiness(
  signals: LicenseeAccountReadinessSignals,
): LicenseeAccountReadiness {
  const dimensions: LicenseeAccountReadinessDimension[] = [
    { key: "brain", label: "Brain ready", ready: signals.brainReady },
    {
      key: "website",
      label: "Website Intelligence",
      ready: signals.websiteIntelligenceReady,
    },
    { key: "seo", label: "SEO Intelligence", ready: signals.seoReady },
    { key: "ads", label: "Ads campaign", ready: signals.adsReady },
    { key: "personas", label: "Persona activity", ready: signals.hasPersonas },
    {
      key: "prospects",
      label: "Prospect activity",
      ready: signals.hasProspects,
    },
  ];

  const readyCount = dimensions.filter((dimension) => dimension.ready).length;
  const totalCount = dimensions.length;
  const percent = Math.round((readyCount / totalCount) * 100);

  return {
    percent,
    readyCount,
    totalCount,
    dimensions,
  };
}
