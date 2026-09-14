/**
 * Prospect-facing re-export of the shared presentation-only grouping helper.
 * Canonical logic lives in lib/deployment/deploymentAssetGroups.ts.
 */

export {
  findDeploymentAssetByKeys as findProspectAssetByKeys,
  groupDeploymentOutreachAssets as groupProspectOutreachAssets,
} from "@/lib/deployment/deploymentAssetGroups";
export type { GroupableDeploymentAsset as ProspectOutreachAssetLike } from "@/lib/deployment/deploymentAssetGroups";
