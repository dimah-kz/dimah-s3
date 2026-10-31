import {
  DEFAULT_INLINE_TYPES,
  s3Error,
  type RouteCatalogEntry,
  type S3Api,
  type S3RequestOptions,
} from "@dimah-s3/core";
import type { S3ApiUploadTransport } from "@dimah-s3/react/engine";
import { forgetDemoFile, getDemoFileUrl } from "@/lib/demo/client-object-store";
import { simulateDemoUpload } from "@/lib/demo/simulate-upload";

const BUCKET = "demo";
const MAX_FILE_SIZE = 75 * 1024 * 1024;
const MAX_EXPIRES_IN = 3600;
/** How long a demo delete takes, so the pending state is visible. */
const DELETE_DELAY_MS = 1200;

const demoRoute: RouteCatalogEntry = {
  upload: {
    enabled: true,
    fileTypes: ["image/*", "application/pdf", "video/*"],
    maxFileSize: MAX_FILE_SIZE,
    multipart: false,
    checksum: false,
  },
  download: {
    enabled: true,
    maxExpiresIn: MAX_EXPIRES_IN,
    disposition: "attachment",
    inlineTypes: [...DEFAULT_INLINE_TYPES],
    mode: "presign",
  },
  delete: { enabled: true },
};

const routes: Record<string, RouteCatalogEntry> = {
  avatar: demoRoute,
  uploads: demoRoute,
};

type PendingUpload = {
  key: string;
  name: string;
  size: number;
  type?: string;
  metadata: Record<string, string>;
};

type DemoObject = Omit<PendingUpload, "key">;

/** Upload tickets issued by `upload` and not yet confirmed. */
const tickets = new Map<string, PendingUpload>();
const objects = new Map<string, DemoObject>();

function routeEntry(route: string): RouteCatalogEntry {
  if (!Object.hasOwn(routes, route)) throw s3Error("UNKNOWN_ROUTE", { route });
  return routes[route];
}

function demoKey(route: string, name: string) {
  const safe = name.replaceAll(/[^\w.-]+/g, "_") || "file";
  return `${route}/${crypto.randomUUID()}/${safe}`;
}

/** Waits `ms`, or rejects with the abort reason once `signal` aborts. */
async function delay(ms: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
  signal?.throwIfAborted();
}

async function removeDemoKey(key: string, options?: S3RequestOptions) {
  await delay(DELETE_DELAY_MS, options?.signal);
  objects.delete(key);
  forgetDemoFile(key);
}

/**
 * Client-side `S3Api` mock for docs demos. File bytes stay in the browser:
 * `upload` issues an in-memory ticket, `uploadTransport` only simulates
 * progress, and `confirm` reads the size and type back from the ticket.
 */
export const demoS3Api: S3Api & Required<S3ApiUploadTransport> = {
  uploadTransport: simulateDemoUpload,

  async upload(payload, options) {
    options?.signal?.throwIfAborted();
    const { upload } = routeEntry(payload.route);
    if (!upload.enabled) {
      throw s3Error("FEATURE_DISABLED", { feature: "upload" });
    }
    if (upload.maxFileSize !== undefined && payload.size > upload.maxFileSize) {
      throw s3Error("FILE_TOO_LARGE", {
        size: payload.size,
        maxFileSize: upload.maxFileSize,
      });
    }

    const key = demoKey(payload.route, payload.name);
    const ticket = `demo.${crypto.randomUUID()}`;
    tickets.set(ticket, {
      key,
      name: payload.name,
      size: payload.size,
      type: payload.type,
      metadata: payload.metadata ?? {},
    });

    const headers: Record<string, string> = {};
    if (payload.type) headers["Content-Type"] = payload.type;
    return {
      key,
      bucket: BUCKET,
      url: "local://demo",
      expiresIn: 3600,
      ticket,
      method: "PUT",
      headers,
    };
  },

  async confirm(payload, options) {
    options?.signal?.throwIfAborted();
    const pending = tickets.get(payload.ticket);
    if (!pending) throw s3Error("UPLOAD_TICKET_INVALID");
    tickets.delete(payload.ticket);

    const { key, ...object } = pending;
    objects.set(key, object);
    return {
      key,
      bucket: BUCKET,
      ...object,
      eTag: '"demo"',
      lastModified: new Date().toISOString(),
    };
  },

  async download(payload, options) {
    options?.signal?.throwIfAborted();
    const { download } = routeEntry(payload.route);
    if (!download.enabled) {
      throw s3Error("FEATURE_DISABLED", { feature: "download" });
    }

    const { key } = payload;
    const disposition = payload.disposition ?? download.disposition;
    const expiresIn = Math.min(
      payload.expiresIn ?? download.maxExpiresIn,
      download.maxExpiresIn,
    );
    const response = {
      key,
      bucket: BUCKET,
      mode: "presign" as const,
      disposition,
      expiresIn,
    };

    // A file uploaded on this page is served from its object URL.
    const localUrl = getDemoFileUrl(key);
    if (localUrl) return { ...response, url: localUrl };

    // Anything else streams zero bytes of the stored (or a default) size.
    const object = objects.get(key);
    const params = new URLSearchParams({
      key,
      bytes: String(object?.size ?? MAX_FILE_SIZE),
    });
    const name = payload.name ?? object?.name;
    if (name) params.set("name", name);
    return { ...response, url: `/api/demo-download?${params}` };
  },

  async delete(payload, options) {
    routeEntry(payload.route);
    await removeDemoKey(payload.key, options);
    return { key: payload.key, bucket: BUCKET };
  },

  async deleteMany(payload, options) {
    routeEntry(payload.route);
    await Promise.all(payload.keys.map((key) => removeDemoKey(key, options)));
    return { deleted: [...payload.keys], failed: [] };
  },

  async catalog(options) {
    options?.signal?.throwIfAborted();
    return { routes };
  },

  // Demo routes set `multipart: false`, so the engine never calls these.
  multipart: {
    init: () => multipartDisabled(),
    signPart: () => multipartDisabled(),
    listParts: () => multipartDisabled(),
    complete: () => multipartDisabled(),
    abort: () => multipartDisabled(),
  },
};

function multipartDisabled(): Promise<never> {
  return Promise.reject(s3Error("FEATURE_DISABLED", { feature: "multipart" }));
}
