import { createS3Client } from "@dimah-s3/core";
import type { ObjectListSource, UseObjectListOptions } from "@dimah-s3/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { DbClientObject, DbObjectSource } from "@/types/client";
import { dbClient } from "./db-client";
import { dbObjectSource } from "./db-object-source";

type Attributes = { label: string };

/** `api.db` of a client with `dbClient()`. No request is sent. */
function clientActions() {
  return createS3Client({ plugins: [dbClient<Attributes>()] }).db;
}

describe("DbObjectSource types", () => {
  it("is assignable to react's ObjectListSource", () => {
    expectTypeOf<DbObjectSource>().toExtend<ObjectListSource<DbClientObject>>();
    expectTypeOf<DbObjectSource<Attributes>>().toExtend<
      ObjectListSource<DbClientObject<Attributes>>
    >();

    const source: ObjectListSource<DbClientObject<Attributes>> =
      dbObjectSource(clientActions());
    expect(source.uploadOptions).toBeTypeOf("function");
  });

  it("spreads into useObjectList options", () => {
    const options: UseObjectListOptions<DbClientObject<Attributes>> = {
      ...dbObjectSource(clientActions(), { route: "docs" }),
      queryKey: ["docs"],
    };
    expect(options.createFolder).toBeTypeOf("function");
  });

  it("accepts api.db and types the rows with its attributes", () => {
    const db = clientActions();
    expectTypeOf(db).toExtend<
      Parameters<typeof dbObjectSource<Attributes>>[0]
    >();
    expectTypeOf(dbObjectSource(db)).toEqualTypeOf<
      DbObjectSource<Attributes>
    >();
    expect(dbObjectSource(db).getKey).toBeTypeOf("function");
  });
});
