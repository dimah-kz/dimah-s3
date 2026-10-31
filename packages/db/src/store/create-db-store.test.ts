import Database from "better-sqlite3";
import { kyselyAdapter } from "fumadb/adapters/kysely";
import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { DimahS3DB } from "@/fuma-db";
import { memoryDbClient } from "@/test/fakes";
import { createDbStore } from "./create-db-store";

function sqliteClient() {
  const db = new Kysely<object>({
    dialect: new SqliteDialect({ database: new Database(":memory:") }),
  });
  return DimahS3DB.client(kyselyAdapter({ db, provider: "sqlite" }));
}

const ref = { bucket: "b", key: "k" };

describe("createDbStore", () => {
  it("refuses a 1.x database on the first query", async () => {
    const client = sqliteClient();
    await (await client.createMigrator().migrateTo("1.0.0")).execute();
    const store = createDbStore(client);

    await expect(store.objects.find(ref)).rejects.toThrow(
      /schema 1\.0\.0.*needs 2\.0\.0.*sql\/upgrade\/1\.0\.0-2\.0\.0/,
    );
    await expect(store.folders.find("user:1", "a")).rejects.toThrow(
      /schema 1\.0\.0/,
    );
    await expect(store.checkSchema()).rejects.toThrow(/schema 1\.0\.0/);
  });

  it("refuses a database with no schema", async () => {
    const store = createDbStore(sqliteClient());
    await expect(store.checkSchema()).rejects.toThrow(/no dimah-s3 schema/);
  });

  it("checks the version once", async () => {
    const client = memoryDbClient();
    const version = vi.spyOn(client, "version");
    const store = createDbStore(client);

    await store.checkSchema();
    await store.objects.find(ref);
    await store.folders.children("user:1", null);
    expect(version).toHaveBeenCalledOnce();
  });

  it("checks again after a failed check", async () => {
    const client = memoryDbClient();
    const version = vi.spyOn(client, "version").mockResolvedValueOnce("1.0.0");
    const store = createDbStore(client);

    await expect(store.objects.find(ref)).rejects.toThrow(/schema 1\.0\.0/);
    await expect(store.objects.find(ref)).resolves.toBeNull();
    expect(version).toHaveBeenCalledTimes(2);
  });
});
