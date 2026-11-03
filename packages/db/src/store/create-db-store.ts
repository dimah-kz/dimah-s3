import { DB_SCHEMA_VERSION, type DimahS3DbClient } from "@/fuma-db";
import { createFolderStore, type StorageFolderStore } from "./folder-store";
import { createObjectStore, type StorageObjectStore } from "./object-store";
import { checkSchemaVersion } from "./schema-version";

/** The stores over one FumaDB client. */
export type DbStore<TAttributes = never> = {
  objects: StorageObjectStore<TAttributes>;
  folders: StorageFolderStore;
  /** Throws unless the database is at the schema the stores use. */
  checkSchema: () => Promise<void>;
};

/**
 * Creates the object and folder stores. The first query checks the schema
 * version, so a database at another version throws instead of being read
 * with the wrong columns. A failed check runs again on the next query.
 */
export function createDbStore<TAttributes = never>(
  client: DimahS3DbClient,
): DbStore<TAttributes> {
  let checked: Promise<void> | undefined;
  const checkSchema = () => {
    checked ??= checkSchemaVersion(client).catch((error: unknown) => {
      checked = undefined;
      throw error;
    });
    return checked;
  };
  const getOrm = async () => {
    await checkSchema();
    return client.orm(DB_SCHEMA_VERSION);
  };
  return {
    objects: createObjectStore<TAttributes>(getOrm),
    folders: createFolderStore(getOrm),
    checkSchema,
  };
}
