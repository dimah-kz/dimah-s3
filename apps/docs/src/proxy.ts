import { NextRequest, NextResponse } from "next/server";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { docsContentRoute, docsRoute } from "@/lib/shared";

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}`,
);
const { rewrite: rewriteMd } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}`,
);
const { rewrite: rewriteMdx } = rewritePath(
  `${docsRoute}{/*path}.mdx`,
  `${docsContentRoute}{/*path}`,
);

export function proxy(request: NextRequest) {
  for (const rewrite of [rewriteMd, rewriteMdx]) {
    const result = rewrite(request.nextUrl.pathname);
    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl));
    }
  }

  if (isMarkdownPreferred(request)) {
    const result = rewriteDocs(request.nextUrl.pathname);

    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl), {
        headers: { Vary: "Accept" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/docs", "/docs.md", "/docs.mdx", "/docs/:path*"],
};
