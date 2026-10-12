import type { ReactNode } from "react";
import { redirectIfFreeUntrainedGrowthRoute } from "@/services/organization/freeProgressionState";

export default async function TractionFamilyLayout({
  children,
}: {
  children: ReactNode;
}) {
  await redirectIfFreeUntrainedGrowthRoute();
  return children;
}
