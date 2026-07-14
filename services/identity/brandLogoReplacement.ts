/**
 * Safe logo replacement / removal sequencing.
 * Storage and DB adapters are injectable for failure-path tests.
 */

export type BrandLogoReplacementPorts = {
  uploadNewObject: () => Promise<string>;
  updateIdentityPath: (storagePath: string) => Promise<void>;
  deleteObject: (storagePath: string) => Promise<void>;
  logCleanupFailure: (context: string, error: unknown) => void;
};

export type BrandLogoRemovalPorts = {
  clearIdentityPath: () => Promise<void>;
  deleteObject: (storagePath: string) => Promise<void>;
  logCleanupFailure: (context: string, error: unknown) => void;
};

/**
 * Required replacement sequence:
 * 1 validate+upload new
 * 2 update DB to new path
 * 3 delete old object
 * On DB failure: compensate by deleting the new object.
 * On old-delete failure after DB success: keep DB reference; log orphan.
 */
export async function executeBrandLogoReplacement(
  ports: BrandLogoReplacementPorts,
  previousStoragePath: string | null,
): Promise<string> {
  const newPath = await ports.uploadNewObject();

  try {
    await ports.updateIdentityPath(newPath);
  } catch (error) {
    try {
      await ports.deleteObject(newPath);
    } catch (cleanupError) {
      ports.logCleanupFailure("new_object_compensation_failed", cleanupError);
    }
    throw error;
  }

  if (previousStoragePath?.trim()) {
    try {
      await ports.deleteObject(previousStoragePath);
    } catch (cleanupError) {
      ports.logCleanupFailure("old_object_cleanup_failed", cleanupError);
    }
  }

  return newPath;
}

/**
 * Required removal sequence:
 * 1 clear DB reference
 * 2 delete old object
 * On delete failure: do not restore DB reference; log orphan.
 */
export async function executeBrandLogoRemoval(
  ports: BrandLogoRemovalPorts,
  previousStoragePath: string | null,
): Promise<void> {
  await ports.clearIdentityPath();

  if (!previousStoragePath?.trim()) {
    return;
  }

  try {
    await ports.deleteObject(previousStoragePath);
  } catch (cleanupError) {
    ports.logCleanupFailure("remove_object_cleanup_failed", cleanupError);
  }
}
