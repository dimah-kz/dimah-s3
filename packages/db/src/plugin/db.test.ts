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
  s3Error,
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
    const docs = await setup.instance.db.folders.create("user:1", {
      parentId: null,
      name: "docs",
    });
    const presigned = await presignAndUpload(setup, "1", { folderId: docs.id });
    const ref = { bucket: "bucket", key: presigned.key };

    await expect(setup.instance.db.objects.find(ref)).resolves.toMatchObject({
      scope: "user:1",
      status: "pending",
      folderId: docs.id,
      declaredSize: 10,
    });
    await setup.instance.api.confirm({ ticket: presigned.ticket }, asUser("1"));
    await expect(setup.instance.db.objects.find(ref)).resolves.toMatchObject({
      status: "active",
      size: 10,
      filename: "a.txt",
    });
    await expect(
      setup.instance.db.folders.find("user:1", docs.id),
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
    const docs = await s3.db.folders.create("user:1", {
      parentId: null,
      name: "docs",
    });
    const quarter = await s3.db.folders.create("user:1", {
      parentId: docs.id,
      name: "q4",
    });

    const put = await s3.put(
      {
        route: "uploads",
        name: "notes.txt",
        type: "text/plain",
        body: "hello",
        clientMetadata: { folderId: quarter.id },
      },
      asUser("1"),
    );
    await expect(
      s3.db.objects.find({ bucket: "bucket", key: put.key }),
    ).resolves.toMatchObject({
      scope: "user:1",
      status: "active",
      folderId: quarter.id,
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
      const profile = await s3.db.folders.create("user:1", {
        parentId: null,
        name: "profile",
      });
      const put = await s3.put(
        {
          route: "avatars",
          name: "me.png",
          body: "one",
          clientMetadata: { folderId: profile.id },
        },
        user,
      );
      const ref = { bucket: "bucket", key: put.key };
      const stored = await s3.db.objects.find(ref);
      const assertServed = async () => {
        await expect(s3.db.objects.find(ref)).resolves.toMatchObject({
          status: "active",
          size: 3,
          folderId: profile.id,
          eTag: stored?.eTag,
        });
        await expect(
          s3.db.objects.list({ scope: "user:1", folderId: profile.id }),
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

  it("fails an upload whose scope is too long before it writes a row", async () => {
    const setup = createSetup({
      plugin: { resolveScope: () => `user:${"a".repeat(300)}` },
    });

    const error = await setup.instance.api
      .upload({ route: "uploads", name: "a.txt", size: 10 })
      .catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(String(setup.logger.error.mock.calls.flat())).toContain(
      "resolveScope returned a scope of 305 characters",
    );
    await expect(
      setup.database.orm("2.2.0").count("storageObject", {}),
    ).resolves.toBe(0);
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

describe("s3.db.record", () => {
  const copy = {
    route: "uploads",
    key: "uploads/plan.pdf",
    name: "plan (copy).pdf",
  };

  async function putObject(
    setup: ReturnType<typeof createSetup>,
    key: string,
    body = "plan-bytes",
    type = "application/pdf",
  ) {
    const bytes = new TextEncoder().encode(body);
    await setup.s3.client.send(
      new PutObjectCommand({
        Bucket: "bucket",
        Key: key,
        Body: bytes,
        ContentType: type,
      }),
    );
    return bytes.byteLength;
  }

  it("records a copied object from HeadObject and counts its bytes", async () => {
    const setup = createSetup();
    const docs = await setup.instance.db.folders.create("user:1", {
      parentId: null,
      name: "docs",
    });
    const size = await putObject(setup, copy.key);

    const row = await setup.instance.db.record(
      { ...copy, folderId: docs.id },
      asUser("1"),
    );

    expect(row).toMatchObject({
      scope: "user:1",
      route: "uploads",
      key: copy.key,
      folderId: docs.id,
      filename: "plan (copy).pdf",
      contentType: "application/pdf",
      size,
      status: "active",
      eTag: "e1",
      uploadToken: null,
    });
    await expect(setup.instance.db.objects.getUsage("user:1")).resolves.toEqual(
      { totalBytes: size, objectCount: 1 },
    );
  });

  it("rejects a key outside the route namespace before HeadObject", async () => {
    const setup = createSetup();
    await putObject(setup, "other/plan.pdf");
    vi.mocked(setup.s3.client.send).mockClear();

    await expect(
      setup.instance.db.record({ ...copy, key: "other/plan.pdf" }, asUser("1")),
    ).rejects.toMatchObject({ code: "KEY_INVALID" });
    expect(setup.s3.client.send).not.toHaveBeenCalled();
  });

  it("rejects a missing object, a signed-out caller, and a bad name", async () => {
    const setup = createSetup();

    await expect(
      setup.instance.db.record(copy, asUser("1")),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    await expect(setup.instance.db.record(copy)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      setup.instance.db.record({ ...copy, name: "a/b.pdf" }, asUser("1")),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      setup.instance.db.record({ ...copy, route: "missing" }, asUser("1")),
    ).rejects.toMatchObject({ code: "UNKNOWN_ROUTE" });
  });

  it("rejects a caller authorize does not allow, before HeadObject", async () => {
    const setup = createSetup({
      plugin: { authorize: ({ operation }) => operation !== "record" },
    });
    await putObject(setup, copy.key);
    vi.mocked(setup.s3.client.send).mockClear();

    await expect(
      setup.instance.db.record(copy, asUser("1")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(setup.s3.client.send).not.toHaveBeenCalled();
  });

  it("rejects a missing folder before HeadObject", async () => {
    const setup = createSetup();
    await putObject(setup, copy.key);
    vi.mocked(setup.s3.client.send).mockClear();

    await expect(
      setup.instance.db.record({ ...copy, folderId: "missing" }, asUser("1")),
    ).rejects.toMatchObject({ code: "FOLDER_NOT_FOUND" });
    expect(setup.s3.client.send).not.toHaveBeenCalled();
  });

  it("keeps an active row and refuses a row an upload or another scope holds", async () => {
    const setup = createSetup();
    await putObject(setup, copy.key);
    await insertObject(setup.database, {
      key: copy.key,
      bucket: "bucket",
      scope: "user:1",
      status: "active",
    });

    await expect(
      setup.instance.db.record(copy, asUser("1")),
    ).rejects.toMatchObject({ code: "OBJECT_EXISTS" });
    expect(setup.s3.objects.has(copy.key)).toBe(true);

    await insertObject(setup.database, {
      key: "uploads/held.pdf",
      bucket: "bucket",
      status: "pending",
      uploadToken: "token",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      setup.instance.db.record(
        { ...copy, key: "uploads/held.pdf", name: "held.pdf" },
        asUser("1"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await insertObject(setup.database, {
      key: "uploads/theirs.pdf",
      bucket: "bucket",
      scope: "user:2",
    });
    await expect(
      setup.instance.db.record(
        { ...copy, key: "uploads/theirs.pdf", name: "theirs.pdf" },
        asUser("1"),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("replaces a deleted row", async () => {
    const setup = createSetup();
    await putObject(setup, copy.key);
    const deleted = await insertObject(setup.database, {
      key: copy.key,
      bucket: "bucket",
      status: "deleted",
    });

    const row = await setup.instance.db.record(copy, asUser("1"));

    expect(row.status).toBe("active");
    expect(row.id).not.toBe(deleted.id);
    expect(row.filename).toBe("plan (copy).pdf");
  });

  it("leaves the object when it is empty or does not fit the quota", async () => {
    const quota = createSetup({ plugin: { quota: { maxBytes: 4 } } });
    await putObject(quota, copy.key, "hello");

    await expect(
      quota.instance.db.record(copy, asUser("1")),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      params: { limit: "bytes" },
    });
    expect(quota.s3.objects.has(copy.key)).toBe(true);
    await expect(
      quota.instance.db.objects.find({ bucket: "bucket", key: copy.key }),
    ).resolves.toBeNull();

    const empty = createSetup();
    await empty.s3.client.send(
      new PutObjectCommand({
        Bucket: "bucket",
        Key: copy.key,
        Body: new Uint8Array(),
        ContentType: "application/pdf",
      }),
    );
    await expect(
      empty.instance.db.record(copy, asUser("1")),
    ).rejects.toMatchObject({ code: "FILE_EMPTY" });
    expect(empty.s3.objects.has(copy.key)).toBe(true);
  });

  it("returns the same row when the bytes have not changed", async () => {
    const setup = createSetup();
    await putObject(setup, copy.key);

    const first = await setup.instance.db.record(copy, asUser("1"));
    const second = await setup.instance.db.record(
      { route: copy.route, key: copy.key },
      asUser("1"),
    );

    expect(second).toEqual(first);
    await expect(setup.instance.db.objects.getUsage("user:1")).resolves.toEqual(
      { totalBytes: first.size, objectCount: 1 },
    );
  });

  it("uses the key's last segment when no name is given", async () => {
    const setup = createSetup();
    await putObject(setup, "uploads/id/plan.pdf");

    await expect(
      setup.instance.db.record(
        { route: "uploads", key: "uploads/id/plan.pdf" },
        asUser("1"),
      ),
    ).resolves.toMatchObject({ filename: "plan.pdf" });
  });

  it("runs the route guard before HeadObject", async () => {
    const setup = createSetup({
      routes: {
        uploads: route({
          upload: true,
          guard: ({ request }) => {
            if (request.headers.get("x-user") !== "1")
              throw s3Error("FORBIDDEN");
          },
        }),
      },
    });
    await putObject(setup, copy.key);
    vi.mocked(setup.s3.client.send).mockClear();

    await expect(
      setup.instance.db.record(copy, asUser("2")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(setup.s3.client.send).not.toHaveBeenCalled();
  });

  it("applies the route file type and size limits and leaves the object", async () => {
    const setup = createSetup({
      routes: {
        uploads: route({
          upload: { fileTypes: ["image/*"], maxFileSize: 4 },
        }),
      },
    });
    await putObject(setup, copy.key);

    await expect(
      setup.instance.db.record(copy, asUser("1")),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    expect(setup.s3.objects.has(copy.key)).toBe(true);

    await putObject(setup, "uploads/a.png", "hello", "image/png");
    await expect(
      setup.instance.db.record(
        { route: "uploads", key: "uploads/a.png", name: "a.png" },
        asUser("1"),
      ),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(setup.s3.objects.has("uploads/a.png")).toBe(true);
  });

  it("refuses a route that does not track objects", async () => {
    const setup = createSetup({
      routes: {
        uploads: route({ upload: true }),
        open: route({ plugins: { db: false }, upload: true }),
      },
    });

    await expect(
      setup.instance.db.record(
        { route: "open", key: "open/a.pdf", name: "a.pdf" },
        asUser("1"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts a key under the route prefix and not the route name", async () => {
    const setup = createSetup({
      routes: {
        drawings: route({ keyPrefix: "files", upload: true }),
      },
    });
    await putObject(setup, "files/a.pdf");

    await expect(
      setup.instance.db.record(
        { route: "drawings", key: "files/a.pdf", name: "a.pdf" },
        asUser("1"),
      ),
    ).resolves.toMatchObject({ key: "files/a.pdf", route: "drawings" });
    await expect(
      setup.instance.db.record(
        { route: "drawings", key: "drawings/a.pdf", name: "a.pdf" },
        asUser("1"),
      ),
    ).rejects.toMatchObject({ code: "KEY_INVALID" });
  });
});
