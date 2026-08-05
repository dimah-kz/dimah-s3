import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { S3ClientProvider } from "@/components/s3-provider";
import { DirectionProvider } from "@/components/ui/direction";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@dimah-s3/ui";

const vazirmatn = localFont({
  src: "../../public/fonts/Vazirmatn-VariableFont_wght.ttf",
  weight: "300 900",
  variable: "--font-sans",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa-IR"
      dir="rtl"
      className={cn("h-full", "antialiased", "font-sans", vazirmatn.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <DirectionProvider direction="rtl">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              <S3ClientProvider>
                {children}
                <Toaster />
              </S3ClientProvider>
            </TooltipProvider>
          </ThemeProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
