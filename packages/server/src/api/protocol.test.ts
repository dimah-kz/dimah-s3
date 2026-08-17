import { S3_API_ROUTES } from "@dimah-s3/core";
import { describe, expect, it } from "vitest";
import { CORE_ENDPOINT_NAMES, coreEndpoints } from "./routes";

const PROTOCOL = [
  ["upload", "POST", S3_API_ROUTES.upload],
  ["confirm", "POST", S3_API_ROUTES.uploadConfirm],
  ["download", "GET", S3_API_ROUTES.download],
  ["delete", "DELETE", S3_API_ROUTES.delete],
  ["multipartInit", "POST", S3_API_ROUTES.multipartInit],
  ["multipartPart", "POST", S3_API_ROUTES.multipartPart],
  ["multipartListParts", "GET", S3_API_ROUTES.multipartListParts],
  ["multipartComplete", "POST", S3_API_ROUTES.multipartComplete],
  ["multipartAbort", "POST", S3_API_ROUTES.multipartAbort],
] as const;

describe("core protocol", () => {
  it("registers every core endpoint name", () => {
    expect([...CORE_ENDPOINT_NAMES].sort()).toEqual(
      [...PROTOCOL.map(([name]) => name)].sort(),
    );
  });

  it.each(PROTOCOL)("%s is %s %s", (name, method, path) => {
    const endpoint = coreEndpoints[name];
    expect(endpoint.path).toBe(path);
    expect(endpoint.options.method).toBe(method);
  });
});
