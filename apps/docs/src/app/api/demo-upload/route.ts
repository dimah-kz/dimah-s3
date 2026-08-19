import { readUploadBodySlowly } from "@/lib/demo/upload-throttle";
import {
  deleteUploadedObject,
  saveUploadedObject,
} from "@/lib/demo/server-object-store";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }

  const expected = Number(searchParams.get("bytes"));
  const expectedBytes = Number.isFinite(expected) ? expected : null;
  const result = await readUploadBodySlowly(request, expectedBytes);

  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  saveUploadedObject(key, {
    body: result.body,
    contentType:
      request.headers.get("content-type") || "application/octet-stream",
  });

  return new Response(null, { status: 200 });
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (key) deleteUploadedObject(key);
  return new Response(null, { status: 204 });
}
