/**
 * Read-only trained Free Home snapshot.
 * Must not create calendars, jobs, scrape, or mutate starter state.
 */

import { presentFreeStarterHome, type FreeStarterHomeView } from "@/lib/home/freeStarterHome";
import { loadFreeStarterAuthority } from "@/services/organization/freeStarterAuthority";
import { getSocialCalendarById } from "@/services/socialPlanner/socialCalendarService";

export async function loadFreeStarterHomeView(
  organizationId: string,
): Promise<FreeStarterHomeView> {
  const starter = await loadFreeStarterAuthority(organizationId);
  if (!starter.calendarId) {
    return presentFreeStarterHome({
      starterStatus: starter.status,
    });
  }

  const calendar = await getSocialCalendarById(
    starter.calendarId,
    organizationId,
  );

  return presentFreeStarterHome({
    starterStatus: starter.status,
    calendarId: starter.calendarId,
    calendarStatus: calendar?.status ?? null,
    socialPackage: calendar?.package_json ?? null,
  });
}
