import { describe, expect, expectTypeOf, it } from "vitest";
import type { S3EndpointContext } from "@/api/context";
import { createLocals, runGuards } from "@/helpers/hooks";
import type { S3ServerCallOptions } from "./config";
import type { GuardContext, UploadOnConfirmedContext } from "./hook-contexts";
import type { Guard } from "./locals";

// Augmentation is program-wide: every test file sees these fields, so tests
// use only these locals keys.
declare module "./locals" {
  interface DimahS3Locals {
    userId?: string;
    role?: string;
  }
}

describe("DimahS3Locals augmentation", () => {
  it("types locals in guards, hooks, endpoints and in-process calls", () => {
    expectTypeOf<GuardContext["locals"]["userId"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<UploadOnConfirmedContext["locals"]["userId"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<S3EndpointContext["locals"]["userId"]>().toEqualTypeOf<
      string | undefined
    >();

    const options: S3ServerCallOptions = { locals: { userId: "u1" } };
    expect(options.locals?.userId).toBe("u1");
  });

  it("types the locals a guard returns", async () => {
    const guard: Guard<GuardContext> = () => ({
      locals: { userId: "u1", role: "admin" },
    });
    // @ts-expect-error -- userId is a string
    const wrong: Guard<GuardContext> = () => ({ locals: { userId: 1 } });
    const context: GuardContext = {
      request: new Request("http://localhost/api/s3"),
      operation: "upload",
      locals: createLocals(),
    };

    await runGuards([{ hook: guard }], context);

    expect(context.locals.userId).toBe("u1");
    expect(typeof wrong).toBe("function");
  });
});
