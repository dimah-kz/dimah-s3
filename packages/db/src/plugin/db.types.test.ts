import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { memoryDbClient } from "@/test/fakes";
import type { StorageObject } from "@/types/storage-object";
import { db } from "./db";

const schema = z.object({ label: z.string() });
type Attributes = z.output<typeof schema>;

describe("db() attribute types", () => {
  it("shows authorize the stored row and attributes", () => {
    const plugin = db({
      client: memoryDbClient(),
      resolveScope: () => "user:1",
      attributes: {
        schema,
        // What the browser sees does not change what the server checks.
        toClient: ({ label }) => ({ title: label.toUpperCase() }),
      },
      authorize: ({ object }) => {
        expectTypeOf(object).toEqualTypeOf<
          StorageObject<Attributes> | undefined
        >();
        return object?.attributes?.label !== "secret";
      },
    });
    expect(plugin.id).toBe("db");
  });

  it("types the change hooks by the session and the stored attributes", () => {
    const plugin = db({
      client: memoryDbClient(),
      getSession: () => ({ userId: "1" }),
      resolveScope: ({ session }) => `user:${session.userId}`,
      attributes: { schema },
      onObjectUpdated: ({ session, before, after }) => {
        expectTypeOf(session).toEqualTypeOf<{ userId: string }>();
        expectTypeOf(before).toEqualTypeOf<StorageObject<Attributes>>();
        expectTypeOf(after.attributes).toEqualTypeOf<Attributes | null>();
      },
      onFolderDeleted: ({ folder, recursive }) => {
        expectTypeOf(folder.path).toBeString();
        expectTypeOf(recursive).toBeBoolean();
      },
    });
    expect(plugin.id).toBe("db");
  });
});
