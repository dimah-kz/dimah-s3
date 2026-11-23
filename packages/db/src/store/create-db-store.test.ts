import { describe, expect, it, vi } from "vitest";
import { DB_SCHEMA_VERSION } from "@/fuma-db";
import { memoryDbClient } from "@/test/fakes";
import { createDbStore } from "./create-db-store";

const ref = { bucket: "b", key: "k" };

describe("createDbStore", () => {
  it("refuses a database at another schema version", async () => {
    const client = memoryDbClient({ version: "1.0.0" });
    const store = createDbStore(client);

    await expect(store.objects.find(ref)).rejects.toThrow(
      /schema 1\.0\.0.*reads 2\.3\.0.*does not upgrade/,
    );
    await expect(store.folders.find("user:1", "a")).rejects.toThrow(
      /schema 1\.0\.0/,
    );
    await expect(store.checkSchema()).rejects.toThrow(/schema 1\.0\.0/);
  });

  it("refuses a database with no schema", async () => {
    const client = memoryDbClient();
    vi.spyOn(client, "version").mockRejectedValueOnce(new Error("missing"));

    await expect(createDbStore(client).checkSchema()).rejects.toThrow(
      /no dimah-s3 schema/,
    );
  });

  it("refuses a database whose tables were never brought to the schema", async () => {
    // Drizzle reads the version from the generated schema file, so a file
    // generated again without a migration still reports the current one.
    const client = memoryDbClient();
    const orm = client.orm(DB_SCHEMA_VERSION);
    const cause = new Error('column "name" does not exist');
    vi.spyOn(client, "orm").mockReturnValue({
      ...orm,
      findFirst: vi.fn(async () => {
        throw cause;
      }),
    } as unknown as typeof orm);

    await expect(createDbStore(client).checkSchema()).rejects.toMatchObject({
      message: expect.stringMatching(
        /storage_object table does not match schema 2\.3\.0/,
      ),
      cause,
    });
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
    const version = vi.spyOn(client, "version").mockResolvedValueOnce(
      // A 1.x database still reports 1.0.0. The client type only names 2.0.0.
      "1.0.0" as unknown as Awaited<ReturnType<typeof client.version>>,
    );
    const store = createDbStore(client);

    await expect(store.objects.find(ref)).rejects.toThrow(/schema 1\.0\.0/);
    await expect(store.objects.find(ref)).resolves.toBeNull();
    expect(version).toHaveBeenCalledTimes(2);
  });
});
