import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Brand studio",
    template: "%s · Brand",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("light font-sans", fontSans.className, fontSans.variable)}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-svh bg-[#f4f4f5] text-[#09090b]">{children}</body>
    </html>
  );
}
