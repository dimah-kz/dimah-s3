import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  formatStandardIssue,
  validateStandardSchema,
  type StandardSchemaV1,
} from "./standard-schema";

const attributes = z.object({
  title: z.string(),
  tags: z.array(z.string()).optional(),
});

describe("validateStandardSchema", () => {
  it("accepts a Zod schema and returns its output", async () => {
    const schema: StandardSchemaV1<unknown, { title: string }> = attributes;
    await expect(
      validateStandardSchema(schema, { title: "Q4", extra: 1 }),
    ).resolves.toEqual({ value: { title: "Q4" } });
  });

  it("returns the issues of an invalid value", async () => {
    const result = await validateStandardSchema(attributes, { tags: [1] });
    expect(result.issues).toEqual([
      expect.objectContaining({ path: ["title"] }),
      expect.objectContaining({ path: ["tags", 0] }),
    ]);
  });

  it("awaits an async validator", async () => {
    const schema: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: async (value) =>
          typeof value === "number"
            ? { value }
            : { issues: [{ message: "Expected a number" }] },
      },
    };
    await expect(validateStandardSchema(schema, 1)).resolves.toEqual({
      value: 1,
    });
    await expect(validateStandardSchema(schema, "1")).resolves.toEqual({
      issues: [{ message: "Expected a number" }],
    });
  });
});

describe("formatStandardIssue", () => {
  it("prefixes the first issue with its dotted path", () => {
    expect(
      formatStandardIssue([
        { message: "Required", path: ["meta", { key: "tags" }, 0] },
        { message: "Ignored" },
      ]),
    ).toBe("meta.tags.0: Required");
  });

  it("uses the message alone without a path", () => {
    expect(formatStandardIssue([{ message: "Too large", path: [] }])).toBe(
      "Too large",
    );
    expect(formatStandardIssue([{ message: "Too large" }])).toBe("Too large");
  });

  it("falls back when there are no issues", () => {
    expect(formatStandardIssue([])).toBe("Invalid value");
  });
});
