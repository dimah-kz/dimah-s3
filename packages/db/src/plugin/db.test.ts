import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import {
  dimahS3,
  route,
  type DimahS3Config,
  type DimahS3RouteConfig,
} from "@dimah-s3/server";
import { describe, expect, it, vi } from "vitest";
import { insertObject } from "@/test/databases";
import { memoryDbClient } from "@/test/fakes";
import type { DbPluginOptions } from "@/types/plugin";
import { db } from "./db";

// The endpoints have their own tests; these cover the hooks and init.
vi.mock("./create-database-endpoints", () => ({
  createDatabaseEndpoints: () => ({}),
}));

const SECRET = "db-test-secret-0123456789abcdef-0123456789";

type StoredObject = {
  size: number;
  type?: string;
  disposition?: string;
  metadata: Record<string, string>;
  eTag: string;
};

function notFound() {
  return new S3ServiceException({
    name: "NotFound",
    $fault: "client",
    $metadata: { httpStatusCode: 404 },
    message: "NotFound",
  });
}

/** An S3 client over a map of objects: PutObject, HeadObject and DeleteObject. */
function memoryS3() {
  const objects = new Map<string, StoredObject>();
  let writes = 0;
  const store = (key: string, object: Omit<StoredObject, "eTag">) => {
    writes += 1;
    objects.set(key, { ...object, eTag: `"e${writes}"` });
  };

  const send = vi.fn(async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      const { Key = "", Body, ContentType, ContentDisposition } = command.input;
      if (!(Body instanceof Uint8Array)) throw new TypeError("expected bytes");
      store(Key, {
        size: Body.byteLength,
        type: ContentType,
        disposition: ContentDisposition,
        metadata: command.input.Metadata ?? {},
      });
      return {};
    }
    if (command instanceof HeadObjectCommand) {
      const object = objects.get(command.input.Key ?? "");
      if (!object) throw notFound();
      return {
        ContentLength: object.size,
        ContentType: object.type,
        ContentDisposition: object.disposition,
        ETag: object.eTag,
        Metadata: { ...object.metadata },
      };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key ?? "");
      return {};
    }
    throw new Error(`memoryS3: unsupported ${String(command)}`);
  });

  const client = new S3Client({
    region: "us-east-1",
    endpoint: "https://s3.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  client.send = send as unknown as S3Client["send"];

  /** Stores what a presigned PUT of `size` bytes with `headers` writes. */
  const receive = (
    upload: { key: string; headers: Record<string, string> },
    size: number,
  ) => {
    const metadata: Record<string, string> = {};
    for (const [name, value] of Object.entries(upload.headers)) {
      const field = name.toLowerCase();
      if (field.startsWith("x-amz-meta-")) {
        metadata[field.slice("x-amz-meta-".length)] = value;
      }
    }
    store(upload.key, {
      size,
      type: upload.headers["content-type"],
      disposition: upload.headers["content-disposition"],
      metadata,
    });
  };

  return { client, objects, receive };
}

/** Scope from the `x-user` header; no header means signed out. */
const userScope: DbPluginOptions["resolveScope"] = ({ request }) => {
  const user = request.headers.get("x-user");
  return user ? `user:${user}` : null;
};

const asUser = (user: string) => ({ headers: { "x-user": user } });

function createSetup(
  options: {
    routes?: Record<string, DimahS3RouteConfig>;
    plugin?: Partial<DbPluginOptions>;
    config?: Partial<DimahS3Config>;
  } = {},
) {
  const s3 = memoryS3();
  const database = memoryDbClient();
  const logger = { warn: vi.fn(), error: vi.fn() };
  const instance = dimahS3({
    client: s3.client,
    bucket: "bucket",
    secret: SECRET,
    logger,
    ...options.config,
    plugins: [
      db({ client: database, resolveScope: userScope, ...options.plugin }),
    ],
    routes: options.routes ?? {
      uploads: route({ upload: true, download: true, delete: true }),
    },
  });
  return { instance, s3, database, logger };
}

/** Presigns a 10-byte PUT and stores its bytes. */
async function presignAndUpload(
  { instance, s3 }: ReturnType<typeof createSetup>,
  user: string,
  metadata?: Record<string, string>,
) {
  const presigned = await instance.api.upload(
    { route: "uploads", name: "a.txt", size: 10, type: "text/plain", metadata },
    asUser(user),
  );
  if (presigned.method !== "PUT") throw new Error("expected a PUT upload");
  s3.receive(presigned, 10);
  return presigned;
}

describe("db plugin", () => {
  it("tracks an upload from presign to confirm", async () => {
    const setup = createSetup();
    const presigned = await presignAndUpload(setup, "1", { folder: "docs" });
    const ref = { bucket: "bucket", key: presigned.key };

    await expect(setup.instance.db.objects.find(ref)).resolves.toMatchObject({
      scope: "user:1",
      status: "pending",
      folder: "docs",
      declaredSize: 10,
    });
    await setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("1"));
    await expect(setup.instance.db.objects.find(ref)).resolves.toMatchObject({
      status: "active",
      size: 10,
      filename: "a.txt",
    });
    await expect(
      setup.instance.db.folders.find("user:1", "docs"),
    ).resolves.toMatchObject({ name: "docs" });
  });

  it("binds the upload ticket to the scope", async () => {
    const setup = createSetup();
    const presigned = await presignAndUpload(setup, "1");

    await expect(
      setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("2")),
    ).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID" });
    await expect(
      setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("1")),
    ).resolves.toMatchObject({ key: presigned.key, size: 10 });
  });

  it("returns the stored object to a replayed confirm", async () => {
    const setup = createSetup();
    const presigned = await presignAndUpload(setup, "1");
    const ref = { bucket: "bucket", key: presigned.key };

    await setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("1"));
    const stored = await setup.instance.db.objects.find(ref);
    await expect(
      setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("1")),
    ).resolves.toMatchObject({ key: presigned.key });
    await expect(setup.instance.db.objects.find(ref)).resolves.toEqual(stored);
  });

  it("deletes the object when the verified size no longer fits the quota", async () => {
    const setup = createSetup({ plugin: { quota: { maxBytes: 15 } } });
    const presigned = await presignAndUpload(setup, "1");
    // Another write lands while the upload is in flight.
    await insertObject(setup.database, { key: "other", size: 10 });

    await expect(
      setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("1")),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      params: { limit: "bytes" },
    });
    expect(setup.s3.objects.has(presigned.key)).toBe(false);
    await expect(
      setup.instance.db.objects.find({ bucket: "bucket", key: presigned.key }),
    ).resolves.toBeNull();
  });

  it("tracks s3.put in the folder from clientMetadata", async () => {
    const { instance: s3 } = createSetup();

    const put = await s3.put(
      {
        route: "uploads",
        name: "notes.txt",
        type: "text/plain",
        body: "hello",
        clientMetadata: { folder: "docs/q4" },
      },
      asUser("1"),
    );
    await expect(
      s3.db.objects.find({ bucket: "bucket", key: put.key }),
    ).resolves.toMatchObject({
      scope: "user:1",
      status: "active",
      folder: "docs/q4",
      size: 5,
    });
  });

  it("honors the route's replace option", async () => {
    const fixedKey = { object: () => ({ key: "me.png" }) };
    const { instance: s3 } = createSetup({
      routes: {
        avatars: route({
          upload: fixedKey,
          plugins: { db: { replace: "overwrite" } },
        }),
        files: route({ upload: fixedKey }),
      },
    });
    const put = (route: string, body: string) =>
      s3.put({ route, name: "me.png", body }, asUser("1"));

    await put("avatars", "one");
    const second = await put("avatars", "second");
    await expect(
      s3.db.objects.find({ bucket: "bucket", key: second.key }),
    ).resolves.toMatchObject({ status: "active", size: 6 });

    await put("files", "one");
    await expect(put("files", "two")).rejects.toMatchObject({
      code: "OBJECT_EXISTS",
    });
  });

  it("keeps serving an object whose overwrite is never confirmed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { instance: s3, s3: storage } = createSetup({
        routes: {
          avatars: route({
            upload: { object: () => ({ key: "me.png" }) },
            download: true,
            plugins: { db: { replace: "overwrite" } },
          }),
        },
      });
      const user = asUser("1");
      const put = await s3.put(
        {
          route: "avatars",
          name: "me.png",
          body: "one",
          clientMetadata: { folder: "profile" },
        },
        user,
      );
      const ref = { bucket: "bucket", key: put.key };
      const stored = await s3.db.objects.find(ref);
      const assertServed = async () => {
        await expect(s3.db.objects.find(ref)).resolves.toMatchObject({
          status: "active",
          size: 3,
          folder: "profile",
          eTag: stored?.eTag,
        });
        await expect(
          s3.db.objects.list({ scope: "user:1", folder: "profile" }),
        ).resolves.toMatchObject({ objects: [{ key: put.key }] });
        await expect(
          s3.api.download({ route: "avatars", key: put.key }, user),
        ).resolves.toMatchObject({ key: put.key });
      };

      // The overwrite is presigned, and its bytes never arrive.
      await s3.api.upload({ route: "avatars", name: "me.png", size: 10 }, user);
      await assertServed();

      vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
      await expect(s3.db.purgeStale()).resolves.toMatchObject({ purged: 1 });
      await assertServed();
      expect(storage.objects.has(put.key)).toBe(true);
      await expect(s3.db.objects.find(ref)).resolves.toMatchObject({
        uploadToken: null,
        expiresAt: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips a route that sets db: false and warns when it is unguarded", async () => {
    const { instance: s3, logger } = createSetup({
      routes: {
        uploads: route({ upload: true, download: true }),
        open: route({ plugins: { db: false }, upload: true, download: true }),
        routeGuarded: route({
          plugins: { db: false },
          guard: () => {},
          delete: true,
        }),
        featureGuarded: route({
          plugins: { db: false },
          delete: { guard: () => {} },
        }),
      },
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Route "open"'),
    );

    // Signed out: the db hooks, which would reject the call, do not run.
    const put = await s3.put({ route: "open", name: "a.txt", body: "hello" });
    await expect(
      s3.db.objects.find({ bucket: "bucket", key: put.key }),
    ).resolves.toBeNull();
  });

  it("issues unbound tickets on a route that sets db: false", async () => {
    const { instance: s3, s3: storage } = createSetup({
      routes: {
        uploads: route({ upload: true }),
        open: route({ plugins: { db: false }, upload: true }),
      },
    });
    const presigned = await s3.api.upload(
      { route: "open", name: "a.txt", size: 10 },
      asUser("1"),
    );
    if (presigned.method !== "PUT") throw new Error("expected a PUT upload");
    storage.receive(presigned, 10);

    await expect(
      s3.api.confirm({ ticket: presigned.ticket }, asUser("2")),
    ).resolves.toMatchObject({ key: presigned.key });
  });

  it("rejects a signed-out upload", async () => {
    const { instance: s3 } = createSetup();

    await expect(
      s3.api.upload({ route: "uploads", name: "a.txt", size: 10 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("exposes the stores and jobs on s3.db", async () => {
    const { instance: s3 } = createSetup();

    expect(s3.context.db).toBe(s3.db);
    await expect(s3.db.checkSchema()).resolves.toBeUndefined();
    await expect(s3.db.purgeStale()).resolves.toEqual({
      purged: 0,
      failed: 0,
      skipped: 0,
      more: false,
    });
    await expect(
      s3.db.pruneDeleted({ olderThan: new Date() }),
    ).resolves.toEqual({ pruned: 0 });
  });
});
