import { readUploadBodySlowly } from "@/lib/demo/upload-throttle";

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

  return new Response(null, { status: 200 });
}
