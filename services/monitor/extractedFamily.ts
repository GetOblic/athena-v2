/**
 * Product-family record produced by the production Solusquare parser.
 * Unknown values stay null. Length stays separate from color and pattern.
 */

export type ExtractedFamily = {
  sourceWebsite: string;
  brand: string | null;
  productFamilyId: string | null;
  productName: string | null;
  category: string | null;
  productUrl: string;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  colorPatternNames: string[];
  colorPatternIds: Array<string | null>;
  distinctVariationCount: number;
  sizeOptions: string[];
  /** Observed length axis, kept separate so it cannot inflate the color count. */
  lengthOptions: string[] | null;
  observedAt: string;
};
