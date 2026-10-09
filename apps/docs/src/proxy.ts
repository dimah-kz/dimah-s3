import { type NextRequest, NextResponse } from "next/server";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import {
  blogContentRoute,
  blogRoute,
  docsContentRoute,
  docsRoute,
} from "@/lib/shared";

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
const { rewrite: rewriteBlog } = rewritePath(
  `${blogRoute}{/*path}`,
  `${blogContentRoute}{/*path}`,
);
const { rewrite: rewriteBlogMd } = rewritePath(
  `${blogRoute}{/*path}.md`,
  `${blogContentRoute}{/*path}`,
);
const { rewrite: rewriteBlogMdx } = rewritePath(
  `${blogRoute}{/*path}.mdx`,
  `${blogContentRoute}{/*path}`,
);

export function proxy(request: NextRequest) {
  for (const rewrite of [
    rewriteMd,
    rewriteMdx,
    rewriteBlogMd,
    rewriteBlogMdx,
  ]) {
    const result = rewrite(request.nextUrl.pathname);
    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl));
    }
  }

  if (isMarkdownPreferred(request)) {
    for (const rewrite of [rewriteDocs, rewriteBlog]) {
      const result = rewrite(request.nextUrl.pathname);

      if (result) {
        return NextResponse.rewrite(new URL(result, request.nextUrl), {
          headers: { Vary: "Accept" },
        });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/docs",
    "/docs.md",
    "/docs.mdx",
    "/docs/:path*",
    "/blog",
    "/blog.md",
    "/blog.mdx",
    "/blog/:path*",
  ],
};
