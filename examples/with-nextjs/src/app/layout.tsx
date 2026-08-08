import type { Metadata } from "next";
import { Toaster } from "@dimah-s3/ui";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { S3ClientProvider } from "@/components/s3-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "dimah-s3 — Next.js",
  description: "Presigned S3 uploads with dimah-s3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased", "font-sans", inter.variable)}
    >
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <S3ClientProvider>{children}</S3ClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
