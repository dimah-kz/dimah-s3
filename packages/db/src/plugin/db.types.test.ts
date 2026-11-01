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
});
