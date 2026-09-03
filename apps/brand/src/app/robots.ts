import type { MetadataRoute } from "next";

/** Internal lab — never index, even if this app is deployed by mistake. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
