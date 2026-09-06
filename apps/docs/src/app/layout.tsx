import "./global.css";
import { Body } from "@/app/layout.client";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Geist } from "next/font/google";
import type { Metadata } from "next";
import { cn } from "cn";
import {
  appName,
  serializeJsonLd,
  siteDescription,
  siteJsonLd,
  siteKeywords,
  siteTitle,
} from "@/lib/shared";
import { getSiteUrl, isProductionDeploy } from "@/lib/site-url";
import { Toaster } from "@dimah-s3/ui";
import { TooltipProvider } from "@/components/ui/tooltip";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const siteUrl = getSiteUrl();
const isProduction = isProductionDeploy();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: siteTitle,
    template: `%s | ${appName}`,
  },
  description: siteDescription,
  applicationName: appName,
  category: "technology",
  keywords: [...siteKeywords],
  authors: [{ name: "Hamidrezakz", url: "https://github.com/dimah-kz" }],
  creator: "@dimahkzx",
  publisher: appName,
  alternates: {
    canonical: "/",
    types: {
      "text/markdown": [
        { url: "/llms.txt", title: "llms.txt" },
        { url: "/llms-full.txt", title: "llms-full.txt" },
      ],
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl.origin,
    siteName: appName,
    title: siteTitle,
    description: siteDescription,
    images: "/og/docs/image.png",
  },
  twitter: {
    card: "summary_large_image",
    site: "@dimahkzx",
    creator: "@dimahkzx",
    title: siteTitle,
    description: siteDescription,
    images: "/og/docs/image.png",
  },
  robots: isProduction
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default function Layout({ children }: LayoutProps<"/">) {
  const jsonLd = siteJsonLd(siteUrl.origin);

  return (
    <html
      lang="en"
      className={cn(fontSans.className, "font-sans", fontSans.variable)}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(jsonLd),
          }}
        />
      </head>
      <Body>
        <RootProvider
          theme={{
            enabled: true,
          }}
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </RootProvider>
      </Body>
    </html>
  );
}
