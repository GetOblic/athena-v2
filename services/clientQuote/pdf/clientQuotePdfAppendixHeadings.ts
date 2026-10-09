/**
 * PDF-only labels for appendix headings seeded from a Ready Estimate.
 * Stored draft and issued snapshot text stays in the authored language.
 * A heading matches only when it is exactly one of the English seed constants.
 * Custom headings and narrative bodies are returned unchanged.
 */

import { CLIENT_QUOTE_APPENDIX_HEADINGS } from "@/services/clientQuote/clientQuoteSeed";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type AppendixHeadingKey = keyof typeof CLIENT_QUOTE_APPENDIX_HEADINGS;

const LOCALIZED: Record<AppendixHeadingKey, Record<OrganizationLanguage, string>> = {
  scope: {
    en: CLIENT_QUOTE_APPENDIX_HEADINGS.scope,
    fr: "Interprétation du périmètre",
    es: "Interpretación del alcance",
    it: "Interpretazione del perimetro",
    de: "Interpretation des Umfangs",
    pt: "Interpretação do âmbito",
  },
  pricingRationale: {
    en: CLIENT_QUOTE_APPENDIX_HEADINGS.pricingRationale,
    fr: "Justification tarifaire",
    es: "Justificación del precio",
    it: "Motivazione del prezzo",
    de: "Preisbegründung",
    pt: "Justificação do preço",
  },
  positioning: {
    en: CLIENT_QUOTE_APPENDIX_HEADINGS.positioning,
    fr: "Positionnement suggéré",
    es: "Posicionamiento sugerido",
    it: "Posizionamento suggerito",
    de: "Vorgeschlagene Positionierung",
    pt: "Posicionamento sugerido",
  },
  drivers: {
    en: CLIENT_QUOTE_APPENDIX_HEADINGS.drivers,
    fr: "Principaux leviers de prix",
    es: "Principales factores de precio",
    it: "Principali leve di prezzo",
    de: "Wesentliche Preistreiber",
    pt: "Principais fatores de preço",
  },
  risks: {
    en: CLIENT_QUOTE_APPENDIX_HEADINGS.risks,
    fr: "Risques et hypothèses",
    es: "Riesgos e hipótesis",
    it: "Rischi e ipotesi",
    de: "Risiken und Annahmen",
    pt: "Riscos e hipóteses",
  },
  guidance: {
    en: CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
    fr: "Orientation",
    es: "Orientación",
    it: "Orientamento",
    de: "Hinweise",
    pt: "Orientação",
  },
};

const KEY_BY_ENGLISH_HEADING = new Map<string, AppendixHeadingKey>(
  (Object.keys(CLIENT_QUOTE_APPENDIX_HEADINGS) as AppendixHeadingKey[]).map((key) => [
    CLIENT_QUOTE_APPENDIX_HEADINGS[key],
    key,
  ]),
);

export function localizeClientQuoteSystemAppendixHeading(
  heading: string,
  language: OrganizationLanguage | string,
): string {
  const key = KEY_BY_ENGLISH_HEADING.get(heading);
  if (!key) return heading;
  const row = LOCALIZED[key];
  if (Object.prototype.hasOwnProperty.call(row, language)) {
    return row[language as OrganizationLanguage];
  }
  return heading;
}
