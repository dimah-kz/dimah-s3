import { S3_API_ROUTES } from "@dimah-s3/core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createS3Endpoint } from "@/api/create-s3-endpoint";
import { route } from "@/route";
import { mockS3, TEST_BUCKET } from "@/test/harness";
import type { DimahS3Config, DimahS3Logger, TicketSubject } from "@/types";
import { applyPlugins } from "./apply-plugins";
import { definePlugin } from "./define-plugin";
import type {
  DimahS3Plugin,
  DimahS3PluginHooks,
  PluginContextMap,
  PluginInitEnv,
} from "./types";

const logger: DimahS3Logger = {};

function config(
  plugins: readonly DimahS3Plugin[],
  routes: DimahS3Config["routes"] = { uploads: route({ upload: true }) },
): DimahS3Config {
  return { client: mockS3(), bucket: TEST_BUCKET, routes, plugins };
}

function apply(
  plugins: readonly DimahS3Plugin[],
  routes?: DimahS3Config["routes"],
) {
  return applyPlugins(config(plugins, routes), logger);
}

const getEndpoint = (path: string) =>
  createS3Endpoint(path, { method: "GET" }, async () => ({}));

describe("applyPlugins: ids and dependencies", () => {
  it.each([
    "handler",
    "api",
    "put",
    "context",
    "getPlugin",
    "$ERROR_CODES",
    "$Infer",
  ])("rejects the instance key %s as an id", (id) => {
    expect(() => apply([definePlugin({ id })])).toThrow(/reserved/);
  });

  it("accepts ids that were only reserved for the old api aliases", () => {
    expect(() =>
      apply([
        definePlugin({ id: "upload" }),
        definePlugin({ id: "multipart" }),
      ]),
    ).not.toThrow();
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      apply([definePlugin({ id: "a" }), definePlugin({ id: "a" })]),
    ).toThrow(/duplicate plugin id "a"/);
  });

  it("rejects a dependency that is not registered", () => {
    expect(() =>
      apply([definePlugin({ id: "a", dependsOn: ["missing"] })]),
    ).toThrow(/"a" depends on "missing", which is not registered/);
  });

  it("rejects circular dependencies", () => {
    expect(() =>
      apply([
        definePlugin({ id: "a", dependsOn: ["b"] }),
        definePlugin({ id: "b", dependsOn: ["c"] }),
        definePlugin({ id: "c", dependsOn: ["a"] }),
      ]),
    ).toThrow("dimahS3: circular plugin dependency a -> b -> c -> a.");
  });

  it("rejects a plugin that depends on itself", () => {
    expect(() => apply([definePlugin({ id: "a", dependsOn: ["a"] })])).toThrow(
      /circular/,
    );
  });

  it("accepts a satisfied graph in any order", () => {
    expect(() =>
      apply([
        definePlugin({ id: "child", dependsOn: ["base", "mid"] }),
        definePlugin({ id: "mid", dependsOn: ["base"] }),
        definePlugin({ id: "base" }),
      ]),
    ).not.toThrow();
  });
});

describe("applyPlugins: context", () => {
  it("keys each context by plugin id and finds plugins by id", () => {
    const audit = definePlugin({ id: "audit", context: { n: 1 } });
    const bare = definePlugin({ id: "bare" });

    const applied = apply([audit, bare]);

    expect(applied.context).toEqual({ audit: { n: 1 } });
    expect(applied.getPlugin("audit")).toBe(audit);
    expect(applied.getPlugin("bare")).toBe(bare);
    expect(applied.getPlugin("missing")).toBeUndefined();
  });
});

describe("applyPlugins: init", () => {
  it("rejects an init that returns a promise", () => {
    expect(() =>
      apply([
        definePlugin({
          id: "a",
          init: (() => Promise.reject(new Error("late"))) as () => void,
        }),
      ]),
    ).toThrow(/plugin "a" init returned a promise/);
  });

  it("runs each init once, in plugin order", () => {
    const order: string[] = [];
    apply([
      definePlugin({ id: "a", init: () => void order.push("a") }),
      definePlugin({ id: "b" }),
      definePlugin({ id: "c", init: () => void order.push("c") }),
    ]);

    expect(order).toEqual(["a", "c"]);
  });

  it("passes the user config, the logger, and every plugin", () => {
    const init = vi.fn<(env: PluginInitEnv) => void>();
    const later = definePlugin({ id: "later" });
    const input = config([definePlugin({ id: "first", init }), later]);
    const warn = vi.fn();

    applyPlugins(input, { warn });

    const env = init.mock.calls[0][0];
    expect(env.config).toBe(input);
    expect(env.getPlugin("later")).toBe(later);
    env.logger.warn?.("checked");
    expect(warn).toHaveBeenCalledWith("checked");
  });

  it("reads the plugin's own route options", () => {
    const seen: Record<string, unknown> = {};
    apply(
      [
        definePlugin({
          id: "db",
          init: ({ routeOptions }) => {
            for (const name of [
              "tracked",
              "off",
              "plain",
              "other",
              "missing",
              "toString",
            ]) {
              seen[name] = routeOptions<{ replace: string }>(name);
            }
          },
        }),
      ],
      {
        tracked: route({
          upload: true,
          plugins: { db: { replace: "overwrite" } },
        }),
        off: route({ download: true, plugins: { db: false } }),
        plain: route({ delete: true }),
        other: route({ delete: true, plugins: { audit: { level: 1 } } }),
      },
    );

    expect(seen).toEqual({
      tracked: { replace: "overwrite" },
      off: false,
      plain: undefined,
      other: undefined,
      missing: undefined,
      toString: undefined,
    });
  });

  it("stops at the first init that throws", () => {
    const later = vi.fn();
    expect(() =>
      apply([
        definePlugin({
          id: "a",
          init: () => {
            throw new Error("a needs upload");
          },
        }),
        definePlugin({ id: "b", init: later }),
      ]),
    ).toThrow("a needs upload");
    expect(later).not.toHaveBeenCalled();
  });
});

describe("applyPlugins: endpoints", () => {
  it("collects the endpoints of every plugin", () => {
    const recent = getEndpoint("/audit/recent");
    const objects = getEndpoint("/db/objects");

    const applied = apply([
      definePlugin({ id: "audit", endpoints: { recent } }),
      definePlugin({ id: "db", endpoints: { objects } }),
    ]);

    expect(applied.endpoints).toEqual({ recent, objects });
  });

  it("rejects a path without a leading slash", () => {
    expect(() =>
      apply([
        definePlugin({
          id: "audit",
          endpoints: { recent: getEndpoint("audit/recent") },
        }),
      ]),
    ).toThrow(/needs a path that starts with "\/"/);
  });

  it.each(Object.values(S3_API_ROUTES))("rejects the core path %s", (path) => {
    expect(() => getEndpoint(path)).toThrow(/belongs to a core endpoint/);
    // A raw better-call endpoint on a core path is caught at dimahS3().
    const raw = Object.assign(getEndpoint("/audit/raw"), {
      path,
    }) as ReturnType<typeof getEndpoint>;
    expect(() =>
      apply([definePlugin({ id: "audit", endpoints: { stolen: raw } })]),
    ).toThrow(/uses the core path/);
  });

  it.each(Object.keys(S3_API_ROUTES))("rejects the core name %s", (name) => {
    expect(() =>
      apply([
        definePlugin({
          id: "audit",
          endpoints: { [name]: getEndpoint("/audit/x") },
        }),
      ]),
    ).toThrow(/reuses an existing endpoint name/);
  });

  it("rejects a name another plugin already uses", () => {
    expect(() =>
      apply([
        definePlugin({ id: "a", endpoints: { list: getEndpoint("/a/list") } }),
        definePlugin({ id: "b", endpoints: { list: getEndpoint("/b/list") } }),
      ]),
    ).toThrow(/"b" endpoint "list" reuses an existing endpoint name/);
  });

  it("rejects a method and path pair that is already mounted", () => {
    expect(() =>
      apply([
        definePlugin({ id: "a", endpoints: { one: getEndpoint("/x") } }),
        definePlugin({ id: "b", endpoints: { two: getEndpoint("/x") } }),
      ]),
    ).toThrow(/duplicates GET \/x/);
  });

  it("allows one path with different methods", () => {
    expect(() =>
      apply([
        definePlugin({
          id: "db",
          endpoints: {
            object: getEndpoint("/db/object"),
            updateObject: createS3Endpoint(
              "/db/object",
              { method: "PATCH" },
              async () => ({}),
            ),
          },
        }),
      ]),
    ).not.toThrow();
  });
});

describe("plugin types", () => {
  it("keeps the literal id and context", () => {
    const audit = definePlugin({ id: "audit", context: { n: 1 } });
    const ready = definePlugin({ id: "ready", context: { ok: true } });

    expectTypeOf(audit.id).toEqualTypeOf<"audit">();
    expectTypeOf<
      PluginContextMap<[typeof audit, typeof ready]>
    >().toEqualTypeOf<{ audit: { n: number }; ready: { ok: boolean } }>();
    expect(apply([audit, ready]).context).toEqual({
      audit: { n: 1 },
      ready: { ok: true },
    });
  });

  it("accepts ticketSubject and the route hook slots", () => {
    const hooks: DimahS3PluginHooks = {
      ticketSubject: ({ route }) => route,
      upload: {
        onStart: () => undefined,
        multipart: { onAbort: () => undefined },
      },
    };

    expectTypeOf(hooks.ticketSubject).toEqualTypeOf<
      TicketSubject | undefined
    >();
    expect(definePlugin({ id: "scope", hooks }).hooks).toBe(hooks);
  });

  it("rejects hooks that are not plugin slots", () => {
    const renamed = definePlugin({
      id: "p",
      hooks: {
        // @ts-expect-error -- onPresigned was renamed to onStart
        upload: { onPresigned: () => undefined },
      },
    });
    const userOption = definePlugin({
      id: "p",
      hooks: {
        // @ts-expect-error -- `object` stays a user upload option
        upload: { object: () => undefined },
      },
    });

    expect([renamed.id, userOption.id]).toEqual(["p", "p"]);
  });

  it("types routeOptions by the caller", () => {
    const seen = vi.fn();
    apply(
      [
        definePlugin({
          id: "db",
          init: ({ routeOptions }) => {
            const options = routeOptions<{ replace?: "overwrite" }>("uploads");
            expectTypeOf(options).toEqualTypeOf<
              { replace?: "overwrite" } | false | undefined
            >();
            seen(options);
          },
        }),
      ],
      { uploads: route({ upload: true, plugins: { db: {} } }) },
    );

    expectTypeOf<ReturnType<PluginInitEnv["routeOptions"]>>().toEqualTypeOf<
      object | false | undefined
    >();
    expect(seen).toHaveBeenCalledWith({});
  });
});
