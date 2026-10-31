import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { memoryDbClient } from "@/test/fakes";
import type { DbClientObject } from "@/types/client";
import type { DbPluginOptions } from "@/types/plugin";
import { db } from "./db";

const schema = z.object({ label: z.string() });
type Attributes = z.output<typeof schema>;

describe("db() attribute types", () => {
  it("shows authorize the stored attributes when toClient is omitted", () => {
    const plugin = db({
      client: memoryDbClient(),
      resolveScope: () => "user:1",
      attributes: { schema },
      authorize: ({ object }) => {
        expectTypeOf(object).toEqualTypeOf<
          DbClientObject<Attributes> | undefined
        >();
        return true;
      },
    });
    expect(plugin.id).toBe("db");
    expectTypeOf<
      DbPluginOptions<undefined, Attributes>["authorize"]
    >().toEqualTypeOf<
      DbPluginOptions<undefined, Attributes, Attributes>["authorize"]
    >();
  });

  it("shows authorize what toClient returns", () => {
    const plugin = db({
      client: memoryDbClient(),
      resolveScope: () => "user:1",
      attributes: {
        schema,
        toClient: ({ label }) => ({ title: label.toUpperCase() }),
      },
      authorize: ({ object }) => {
        expectTypeOf(object).toEqualTypeOf<
          DbClientObject<{ title: string }> | undefined
        >();
        return true;
      },
    });
    expect(plugin.id).toBe("db");
  });
});
