import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { toHonoHandler } from "@dimah-s3/server/hono";
import { s3 } from "./s3.js";

const app = new Hono();

app.on(["GET", "POST", "DELETE"], "/api/s3/*", toHonoHandler(s3));

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, () => {
  console.log(`dimah-s3 API listening on http://127.0.0.1:${port}`);
});
