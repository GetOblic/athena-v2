import type { ReactNode } from "react";
import { redirectIfFreeUntrainedGrowthRoute } from "@/services/organization/freeProgressionState";

export default async function AdsFamilyLayout({
  children,
}: {
  children: ReactNode;
}) {
  await redirectIfFreeUntrainedGrowthRoute();
  return children;
}
