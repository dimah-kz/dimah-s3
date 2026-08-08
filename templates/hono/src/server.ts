import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { toHonoHandler } from "@dimah-s3/server/hono";
import { s3 } from "./lib/s3";

const port = Number(process.env.PORT ?? 3000);
const hasClientBuild = existsSync(
  new URL("../dist/index.html", import.meta.url),
);

const app = new Hono();

app.on(["GET", "POST", "DELETE"], "/api/s3/*", toHonoHandler(s3));

if (hasClientBuild) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`dimah-s3 Hono listening on http://127.0.0.1:${port}`);
  if (!hasClientBuild) {
    console.log("Dev API ready — open the Vite URL (proxies /api here).");
  }
});
