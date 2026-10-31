import { DEFAULT_INLINE_TYPES, s3Error } from "@dimah-s3/core";
import { describe, expect, it, vi } from "vitest";
import { resolveRoutes } from "@/helpers/features";
import { route } from "@/route";
import {
  defaultUploadBody,
  memoryS3,
  TEST_BUCKET,
  testConfig,
  testRoute,
} from "@/test/harness";
import type { DimahS3RouteConfig } from "@/types/config";
import type { GuardContext } from "@/types/hook-contexts";
import type { DimahS3Locals, Guard } from "@/types/locals";
import type { ResolvedConfig } from "@/types/resolved";
import { buildRouteCatalog, createS3Api } from "./s3-api";

const MIB = 1024 * 1024;
const MAX_EXPIRES_IN = 604_800;

function setup(config: Partial<ResolvedConfig> = {}) {
  const s3 = memoryS3();
  const resolved = testConfig({
    routes: { uploads: testRoute({ client: s3.client }) },
    ...config,
  });
  return { s3, config: resolved, api: createS3Api(resolved) };
}

/** A resolved config built from user route options, as `dimahS3()` does. */
function catalogOf(routes: Record<string, DimahS3RouteConfig>) {
  const config = testConfig({
    routes: resolveRoutes(
      { client: memoryS3().client, bucket: TEST_BUCKET, routes },
      { maxExpiresIn: MAX_EXPIRES_IN },
    ),
  });
  return buildRouteCatalog(config).routes;
}

describe("s3.api", () => {
  it("presigns, receives and confirms an upload", async () => {
    const { s3, api } = setup();

    const presigned = await api.upload(defaultUploadBody);
    if (presigned.method !== "PUT") throw new Error("expected a PUT upload");
    await s3.receiveUpload({
      key: presigned.key,
      body: "0123456789",
      headers: presigned.headers,
    });

    await expect(api.confirm({ ticket: presigned.ticket })).resolves.toEqual(
      expect.objectContaining({
        key: presigned.key,
        bucket: TEST_BUCKET,
        name: "a.png",
        size: 10,
        type: "image/png",
      }),
    );
  });

  it("downloads and deletes by route and key", async () => {
    const { s3, api } = setup();
    s3.seed("uploads/a.png", "png", { contentType: "image/png" });

    await expect(
      api.download({ route: "uploads", key: "uploads/a.png" }),
    ).resolves.toMatchObject({ key: "uploads/a.png", mode: "presign" });
    await expect(
      api.delete({ route: "uploads", key: "uploads/a.png" }),
    ).resolves.toEqual({ key: "uploads/a.png", bucket: TEST_BUCKET });
    await expect(
      api.deleteMany({ route: "uploads", keys: ["uploads/b.png"] }),
    ).resolves.toEqual({ deleted: ["uploads/b.png"], failed: [] });
    expect(s3.get("uploads/a.png")).toBeUndefined();
  });

  it("runs multipart calls with the init ticket", async () => {
    const { s3, api } = setup();

    const init = await api.multipart.init({
      ...defaultUploadBody,
      size: 20 * MIB,
    });
    const { ticket } = init;
    await expect(
      api.multipart.signPart({ ticket, partNumber: 1 }),
    ).resolves.toMatchObject({ partNumber: 1, size: init.partSize });
    await expect(api.multipart.listParts({ ticket })).resolves.toEqual({
      parts: [],
    });
    await expect(api.multipart.complete({ ticket })).rejects.toMatchObject({
      code: "MULTIPART_PART_MISSING",
    });
    await expect(api.multipart.abort({ ticket })).resolves.toEqual({
      key: init.key,
      uploadId: init.uploadId,
    });
    expect(s3.uploads.size).toBe(0);
  });

  it.each([
    [
      "upload",
      (api: ReturnType<typeof createS3Api>) =>
        api.upload({ ...defaultUploadBody, size: -1 }),
      "[body.size]",
    ],
    [
      "download",
      (api: ReturnType<typeof createS3Api>) =>
        api.download({ route: "uploads", key: "" }),
      "[query.key]",
    ],
    [
      "signPart",
      (api: ReturnType<typeof createS3Api>) =>
        api.multipart.signPart({ ticket: "t", partNumber: 0 }),
      "[body.partNumber]",
    ],
  ])(
    "rejects an invalid %s payload before any guard runs",
    async (_, call, path) => {
      const guard = vi.fn();
      const { api, s3 } = setup({ guard: [{ hook: guard }] });

      const error = await call(api).catch((reason: unknown) => reason);

      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
        params: { issue: expect.stringContaining(path) },
      });
      expect(guard).not.toHaveBeenCalled();
      expect(s3.send).not.toHaveBeenCalled();
    },
  );

  it("rejects keys the browser payload does not have", async () => {
    const { api } = setup();
    const payload = { query: { route: "uploads", key: "uploads/a.png" } };

    await expect(
      // @ts-expect-error -- s3.api takes the payload itself, not `{ query }`
      api.download(payload),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("seeds locals from options and passes them to every guard", async () => {
    const seen: DimahS3Locals[] = [];
    const record: Guard<GuardContext> = ({ locals }) => {
      seen.push(locals);
    };
    const { api } = setup({ guard: [{ hook: record }] });
    const locals = { userId: "u1" } as Partial<DimahS3Locals>;

    await api.catalog({ locals });

    expect(seen).toHaveLength(1);
    expect(Object.getPrototypeOf(seen[0])).toBeNull();
    expect({ ...seen[0] }).toEqual({ userId: "u1" });
    expect(seen[0]).not.toBe(locals);
  });

  it("builds a request from baseURL and headers when none is passed", async () => {
    let request: Request | undefined;
    const { api } = setup({
      baseURL: "https://app.example.com/api/s3",
      guard: [
        {
          hook: (context) => {
            request = context.request;
          },
        },
      ],
    });

    await api.catalog({ headers: { cookie: "session=abc" } });

    expect(request?.url).toBe("https://app.example.com/api/s3");
    expect(request?.headers.get("cookie")).toBe("session=abc");
  });

  it("hands a passed request to the hooks unchanged", async () => {
    const incoming = new Request("https://app.example.com/page");
    let request: Request | undefined;
    const { api } = setup({
      guard: [
        {
          hook: (context) => {
            request = context.request;
          },
        },
      ],
    });

    await api.catalog({ request: incoming });

    expect(request).toBe(incoming);
  });
});

describe("catalog", () => {
  it("lists each route with every field present", () => {
    expect(
      catalogOf({
        uploads: route({
          upload: { fileTypes: ["image/*"], maxFileSize: 10, multipart: true },
          download: { disposition: "inline", mode: "proxy" },
          delete: true,
        }),
      }),
    ).toEqual({
      uploads: {
        upload: {
          enabled: true,
          fileTypes: ["image/*"],
          maxFileSize: 10,
          multipart: true,
          checksum: false,
        },
        download: {
          enabled: true,
          maxExpiresIn: 600,
          disposition: "inline",
          inlineTypes: DEFAULT_INLINE_TYPES.filter(
            (type) => type !== "application/pdf",
          ),
          mode: "proxy",
        },
        delete: { enabled: true },
      },
    });
  });

  it("reports features that are off", () => {
    expect(catalogOf({ files: route({ download: true }) }).files).toEqual({
      upload: { enabled: false },
      download: {
        enabled: true,
        maxExpiresIn: 600,
        disposition: "attachment",
        inlineTypes: [...DEFAULT_INLINE_TYPES],
        mode: "presign",
      },
      delete: { enabled: false },
    });
  });

  it("reports checksum as on when verifyContent is on", () => {
    const { upload } = catalogOf({
      uploads: route({ upload: { verifyContent: true } }),
    }).uploads;
    expect(upload).toEqual({ enabled: true, multipart: false, checksum: true });
  });

  it.each([
    [
      ["image/*", "application/pdf"],
      ["image/*", "application/pdf"],
    ],
    [false, []],
  ] as const)("reports inlineTypes %j as %j", (inlineTypes, expected) => {
    const { download } = catalogOf({
      uploads: route({ download: { inlineTypes } }),
    }).uploads;
    expect(download).toMatchObject({ enabled: true, inlineTypes: expected });
  });

  it("caps maxExpiresIn at the instance limit", () => {
    const config = testConfig({
      routes: resolveRoutes(
        {
          client: memoryS3().client,
          bucket: TEST_BUCKET,
          routes: { uploads: route({ download: { maxExpiresIn: 7200 } }) },
        },
        { maxExpiresIn: 3600 },
      ),
    });
    expect(buildRouteCatalog(config).routes.uploads.download).toMatchObject({
      maxExpiresIn: 3600,
    });
  });

  it("runs the instance guard through s3.api.catalog", async () => {
    const { api } = setup({
      guard: [
        {
          hook: () => {
            throw s3Error("UNAUTHORIZED");
          },
        },
      ],
    });
    await expect(api.catalog()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });
});
