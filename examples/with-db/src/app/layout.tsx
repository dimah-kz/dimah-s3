import type { Metadata } from "next";
import { Toaster } from "@dimah-s3/ui";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { S3ClientProvider } from "@/components/s3-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "dimah-s3 — with-db example",
  description: "Minimal Next.js + Drizzle + SQLite example for @dimah-s3/db",
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
      <body className="min-h-full flex flex-col font-sans">
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
