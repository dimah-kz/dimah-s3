import {
  defineClientPlugin,
  defineErrorCodes,
  isS3ErrorCode,
  pluginPath,
  s3Error,
} from "@dimah-s3/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import * as z from "zod";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { dimahS3 } from "@/dimah-s3";
import { definePlugin } from "@/plugin";
import { route } from "@/route";
import { createMemoryS3 } from "./memory-s3";
import { createTestClient, uploadTestFile } from "./test-client";
import { createTestInstance } from "./test-instance";

const NOTES_ERROR_CODES = defineErrorCodes({
  NOTES_ROUTE_CLOSED: {
    status: 403,
    message: 'Route "{route}" takes no notes',
  },
});

/** A small plugin: it counts confirmed uploads and serves notes. */
function notes() {
  const confirmed: string[] = [];
  return definePlugin({
    id: "notes",
    $ERROR_CODES: NOTES_ERROR_CODES,
    hooks: {
      upload: {
        onConfirmed: ({ key }) => {
          confirmed.push(key);
        },
      },
    },
    endpoints: {
      listNotes: createS3Endpoint(
        pluginPath("notes", "list"),
        {
          method: "GET",
          query: z.object({ route: z.string() }),
        },
        async (ctx) => {
          if (ctx.query.route === "closed") {
            throw s3Error(NOTES_ERROR_CODES.NOTES_ROUTE_CLOSED, {
              route: ctx.query.route,
            });
          }
          return { keys: [...confirmed], at: new Date(0).toISOString() };
        },
      ),
    },
    context: { confirmed },
  });
}

function notesClient() {
  return defineClientPlugin({
    id: "notes",
    $InferServerPlugin: {} as ReturnType<typeof notes>,
    $ERROR_CODES: NOTES_ERROR_CODES,
    getActions: ($fetch) => ({
      listNotes: (route: string) =>
        $fetch("/notes/list", { method: "GET", query: { route } }),
    }),
  });
}

describe("createTestInstance", () => {
  it("uploads through the handler and runs the plugin hooks", async () => {
    const { s3, storage, upload } = createTestInstance({
      plugins: [notes()],
      routes: { uploads: route({ upload: true, download: true }) },
    });

    const object = await upload({
      route: "uploads",
      name: "a.txt",
      type: "text/plain",
      body: "hello",
    });

    expect(object.size).toBe(5);
    expect(storage.get(object.key)?.body).toEqual(
      new TextEncoder().encode("hello"),
    );
    expect(s3.notes.confirmed).toEqual([object.key]);
  });

  it("types the client plugin by the server plugin's endpoints", async () => {
    const { client, upload } = createTestInstance({
      plugins: [notes()],
      clientPlugins: [notesClient()],
      routes: { uploads: route({ upload: true }) },
    });
    const { key } = await upload({
      route: "uploads",
      name: "a.txt",
      body: "x",
    });

    const result = await client.notes.listNotes("uploads");

    expect(result).toEqual({ keys: [key], at: "1970-01-01T00:00:00.000Z" });
    expectTypeOf(result).toEqualTypeOf<{ keys: string[]; at: string }>();
  });

  it("sends plugin error codes that the client can match", async () => {
    const { s3, client } = createTestInstance({
      plugins: [notes()],
      clientPlugins: [notesClient()],
      routes: { uploads: route({ upload: true }) },
    });

    const error: unknown = await client.notes
      .listNotes("closed")
      .catch((caught: unknown) => caught);

    expect(isS3ErrorCode(error, client.$ERROR_CODES.NOTES_ROUTE_CLOSED)).toBe(
      true,
    );
    expect(error).toMatchObject({
      statusCode: 403,
      message: 'Route "closed" takes no notes',
      params: { route: "closed" },
    });
    expect(s3.$ERROR_CODES.NOTES_ROUTE_CLOSED).toBe(
      NOTES_ERROR_CODES.NOTES_ROUTE_CLOSED,
    );
    expectTypeOf(
      s3.$ERROR_CODES.NOTES_ROUTE_CLOSED.code,
    ).toEqualTypeOf<"NOTES_ROUTE_CLOSED">();
  });

  it("uploads to a route that requires a checksum", async () => {
    const { upload } = createTestInstance({
      routes: { uploads: route({ upload: { checksum: true } }) },
    });

    await expect(
      upload({ route: "uploads", name: "a.bin", body: new Uint8Array([1, 2]) }),
    ).resolves.toMatchObject({ size: 2 });
  });

  it("rejects an upload whose declared size is wrong, and runs onRejected", async () => {
    const onRejected = vi.fn();
    const { upload, storage } = createTestInstance({
      routes: { uploads: route({ upload: { onRejected } }) },
    });

    await expect(
      upload({ route: "uploads", name: "a.txt", body: "hello", size: 4 }),
    ).rejects.toMatchObject({ code: "UPLOAD_SIZE_MISMATCH" });
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(storage.objects.size).toBe(0);
  });

  it("sends per-call headers to the guards", async () => {
    const guard = vi.fn();
    const { client } = createTestInstance({
      guard,
      routes: { uploads: route({ upload: true }) },
    });

    await client.catalog({ headers: { authorization: "Bearer t" } });

    expect(guard.mock.calls[0][0].request.headers.get("authorization")).toBe(
      "Bearer t",
    );
  });

  it("follows the instance basePath", async () => {
    const { client } = createTestInstance({
      basePath: "/storage",
      routes: { uploads: route({ upload: true }) },
    });

    await expect(client.catalog()).resolves.toMatchObject({
      routes: { uploads: expect.any(Object) },
    });
  });
});

describe("createMemoryS3 and createTestClient", () => {
  it("compose into a test instance by hand", async () => {
    const storage = createMemoryS3({ bucket: "files" });
    const s3 = dimahS3({
      client: storage.client,
      bucket: "files",
      secret: "a-test-secret-that-is-long-enough-0123",
      routes: { uploads: route({ upload: true, delete: true }) },
    });
    const client = createTestClient(s3);

    const { key } = await uploadTestFile(
      { client, storage },
      { route: "uploads", name: "a.txt", body: "hi" },
    );
    expect(storage.get(key)).toBeDefined();

    await client.delete({ route: "uploads", key });
    expect(storage.get(key)).toBeUndefined();
  });

  it("stores seeded objects under the default bucket", () => {
    const storage = createMemoryS3();
    storage.seed("k", "v");
    expect(storage.get("k", "test-bucket")?.body).toEqual(
      new TextEncoder().encode("v"),
    );
  });
});
