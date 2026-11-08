import { describe, expect, it, vi } from "vitest";
import type { ScopeContext } from "@/types/plugin";
import { createScopeResolver } from "./scope";

type Session = { userId: string };

const locals = { tenant: "acme" };

describe("createScopeResolver", () => {
  it("passes the request, locals, session, operation, and route to resolveScope", async () => {
    const request = new Request("http://localhost/api/s3/upload");
    const resolveScope = vi.fn(
      ({ session }: ScopeContext<Session>) => `user:${session.userId}`,
    );
    const resolve = createScopeResolver<Session>({
      getSession: () => ({ userId: "1" }),
      resolveScope,
    });

    const target = { operation: "upload" as const, route: "uploads" };
    await expect(resolve({ request, locals }, target)).resolves.toEqual({
      request,
      locals,
      session: { userId: "1" },
      ...target,
      scope: "user:1",
    });
    expect(resolveScope).toHaveBeenCalledWith({
      request,
      locals,
      session: { userId: "1" },
      ...target,
    });
  });

  it("loads the session once per request", async () => {
    const getSession = vi.fn(async (request: Request) => ({
      userId: new URL(request.url).searchParams.get("user") ?? "",
    }));
    const resolve = createScopeResolver<Session>({
      getSession,
      resolveScope: ({ session }) => `user:${session.userId}`,
    });
    const first = new Request("http://localhost/?user=1");
    const second = new Request("http://localhost/?user=2");

    // Each call has its own `locals`, as the server creates them.
    await resolve({ request: first, locals: {} }, { operation: "upload" });
    await resolve({ request: first, locals: {} }, { operation: "confirm" });
    const other = await resolve(
      { request: second, locals: {} },
      { operation: "upload" },
    );

    expect(getSession).toHaveBeenCalledTimes(2);
    expect(other.scope).toBe("user:2");
  });

  it("resolves the scope once per call, operation, and route", async () => {
    const request = new Request("http://localhost/");
    const resolveScope = vi.fn(() => "user:1");
    const resolve = createScopeResolver({ resolveScope });
    const call = { request, locals: { tenant: "acme" } };

    await resolve(call, { operation: "upload", route: "uploads" });
    await resolve(call, { operation: "upload", route: "uploads" });
    expect(resolveScope).toHaveBeenCalledTimes(1);

    await resolve(call, { operation: "upload" });
    await resolve(call, { operation: "download", route: "uploads" });
    expect(resolveScope).toHaveBeenCalledTimes(3);
  });

  it("shares the scope between the hooks of one call", async () => {
    const resolveScope = vi.fn(() => "user:1");
    const resolve = createScopeResolver({ resolveScope });
    const call = {
      request: new Request("http://localhost/"),
      locals: { tenant: "acme" },
    };
    const target = { operation: "confirm" as const, route: "uploads" };

    await resolve(call, target);
    // A later hook of the call spreads the same `locals` into its context.
    await resolve({ request: call.request, locals: call.locals }, target);
    expect(resolveScope).toHaveBeenCalledTimes(1);
  });

  it("resolves again for a call with its own locals, even on the same request", async () => {
    const request = new Request("http://localhost/");
    const resolve = createScopeResolver({
      resolveScope: ({ locals }: ScopeContext) =>
        `org:${(locals as { orgId?: string }).orgId}`,
    });
    const target = { operation: "list" as const };

    const first = await resolve({ request, locals: { orgId: "a" } }, target);
    const second = await resolve({ request, locals: { orgId: "b" } }, target);
    expect(first.scope).toBe("org:a");
    expect(second.scope).toBe("org:b");
  });

  it("passes no session without getSession", async () => {
    const resolveScope = vi.fn(() => "user:1");
    const resolve = createScopeResolver({ resolveScope });

    await resolve(
      { request: new Request("http://localhost/"), locals },
      { operation: "list" },
    );
    expect(resolveScope).toHaveBeenCalledWith(
      expect.objectContaining({ session: undefined }),
    );
  });

  it("rejects a null scope with UNAUTHORIZED", async () => {
    const resolve = createScopeResolver({ resolveScope: async () => null });

    await expect(
      resolve(
        { request: new Request("http://localhost/"), locals },
        { operation: "list" },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
  });

  it("fails a scope longer than the column as a config error", async () => {
    const call = { request: new Request("http://localhost/"), locals };
    const resolveWith = (scope: string) =>
      createScopeResolver({ resolveScope: () => scope })(call, {
        operation: "upload",
      });

    // Characters, not UTF-16 units: 255 emoji fit.
    const longest = "\u{1f4c1}".repeat(255);
    await expect(resolveWith(longest)).resolves.toMatchObject({
      scope: longest,
    });
    const error = await resolveWith(`user:${"a".repeat(251)}`).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty("code");
    expect((error as Error).message).toBe(
      "[dimah-s3/db] resolveScope returned a scope of 256 characters. A scope holds at most 255.",
    );
  });
});
