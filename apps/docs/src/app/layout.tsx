import "./global.css";
import { Body } from "@/app/layout.client";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Geist, Inter } from "next/font/google";
import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { appName } from "@/lib/shared";
import { getSiteUrl } from "@/lib/site-url";
import { Toaster } from "@dimah-s3/ui";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontSans = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description:
    "Presigned S3 upload, download, and delete for client apps and Next.js.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(fontSans.className, "font-sans", inter.variable)}
      suppressHydrationWarning
    >
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
