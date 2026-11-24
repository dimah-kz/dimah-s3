import { createS3Client } from "@dimah-s3/core";
import type { ObjectListSource, UseObjectListOptions } from "@dimah-s3/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ShareClientActions,
  ShareLinkResponse,
  ShareVisitorObject,
} from "@/types/client";
import { shareClient } from "./share-client";
import {
  shareObjectSource,
  type ShareObjectSource,
} from "./share-object-source";

/** `api.share` of a client with `shareClient()`. No request is sent. */
function clientActions() {
  return createS3Client({ plugins: [shareClient()] }).share;
}

describe("share client types", () => {
  it("puts ShareClientActions on api.share, and the codes on $ERROR_CODES", () => {
    const api = createS3Client({ plugins: [shareClient()] });
    expectTypeOf(api.share).toEqualTypeOf<ShareClientActions>();
    expectTypeOf(
      api.share.createLink,
    ).returns.resolves.toEqualTypeOf<ShareLinkResponse>();
    expect(api.$ERROR_CODES.SHARE_LINK_EXPIRED.status).toBe(410);
  });

  it("gives a source assignable to react's ObjectListSource", () => {
    expectTypeOf<ShareObjectSource>().toExtend<
      ObjectListSource<ShareVisitorObject>
    >();
    const options: UseObjectListOptions<ShareVisitorObject> = {
      ...shareObjectSource(clientActions(), { token: "t" }),
      queryKey: ["share", "t"],
    };
    expect(options.getId).toBeTypeOf("function");
  });
});
