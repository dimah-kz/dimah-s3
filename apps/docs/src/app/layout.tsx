import "./global.css";
import { Body } from "@/app/layout.client";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Geist } from "next/font/google";
import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import {
  appName,
  siteDescription,
  siteJsonLd,
  siteTitle,
} from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";
import { Toaster } from "@dimah-s3/ui";
import { TooltipProvider } from "@/components/ui/tooltip";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: siteTitle,
    template: `%s | ${appName}`,
  },
  description: siteDescription,
  applicationName: appName,
  alternates: {
    types: {
      "text/markdown": "/llms.txt",
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
    title: siteTitle,
    description: siteDescription,
    images: "/og/docs/image.png",
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  const jsonLd = siteJsonLd(siteUrl.origin);

  return (
    <html
      lang="en"
      className={cn(fontSans.className, "font-sans", fontSans.variable)}
      suppressHydrationWarning
    >
      <Body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
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
