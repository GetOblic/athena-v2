/**
 * Estimate destination for Create Quote.
 * The query identifies the requested client and Prospect. It is not authority.
 */

export function prospectCreateQuoteEstimateHref(
  organizationId: string,
  prospectId: string,
): string {
  const params = new URLSearchParams({
    organizationId,
    prospectId,
  });
  return `/licensee/estimate?${params.toString()}`;
}
