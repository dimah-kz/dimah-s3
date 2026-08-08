import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@dimah-s3/ui";
import { ThemeProvider } from "@/components/theme-provider";
import { S3ClientProvider } from "@/components/s3-provider";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <S3ClientProvider>
        <App />
        <Toaster />
      </S3ClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
