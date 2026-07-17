import { join } from "node:path";

export function harnessRoot(cwd = process.cwd()): string {
  return join(cwd, "scripts/evaluation/breakthrough");
}

export function doctrinePath(cwd = process.cwd()): string {
  return join(harnessRoot(cwd), "doctrine/breakthrough_doctrine.v1.txt");
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
