import { join } from "node:path";
import {
  DOCTRINE_V1_FILENAME,
  DOCTRINE_V2_FILENAME,
  type DoctrineVersion,
} from "./constants";

export function harnessRoot(cwd = process.cwd()): string {
  return join(cwd, "scripts/evaluation/breakthrough");
}

export function doctrineFilename(version: DoctrineVersion = "v1"): string {
  return version === "v2" ? DOCTRINE_V2_FILENAME : DOCTRINE_V1_FILENAME;
}

export function doctrinePath(
  cwd = process.cwd(),
  version: DoctrineVersion = "v1",
): string {
  return join(harnessRoot(cwd), "doctrine", doctrineFilename(version));
}

export function fixturesDir(cwd = process.cwd()): string {
  return join(harnessRoot(cwd), "fixtures/prospects");
}

export function outDir(cwd = process.cwd()): string {
  return join(harnessRoot(cwd), "out");
}

export function reportsDir(cwd = process.cwd()): string {
  return join(harnessRoot(cwd), "reports");
}
