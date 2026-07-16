/**
 * Ephemeral, job-scoped Crawlee storage. Not Athena's source of truth.
 */

import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Configuration, MemoryStorage } from "crawlee";

export type JobCrawleeStorage = {
  jobId: string;
  localDataDirectory: string;
  storageClient: MemoryStorage;
  config: Configuration;
};

export async function createJobCrawleeStorage(
  jobId: string,
): Promise<JobCrawleeStorage> {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const localDataDirectory = path.join(
    os.tmpdir(),
    "athena-deep-scrape",
    `${safeJobId}-${Date.now()}`,
  );
  await mkdir(localDataDirectory, { recursive: true });

  const storageClient = new MemoryStorage({
    localDataDirectory,
    persistStorage: false,
    writeMetadata: false,
  });

  const config = new Configuration({
    storageClient,
    persistStorage: false,
    // Avoid default shared storage paths across jobs/tenants.
    defaultDatasetId: `dataset-${safeJobId}`,
    defaultKeyValueStoreId: `kv-${safeJobId}`,
    defaultRequestQueueId: `queue-${safeJobId}`,
  });

  return {
    jobId,
    localDataDirectory,
    storageClient,
    config,
  };
}

export async function cleanupJobCrawleeStorage(
  storage: JobCrawleeStorage | null | undefined,
): Promise<void> {
  if (!storage) return;
  try {
    await rm(storage.localDataDirectory, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; durable job record remains source of truth.
  }
}
