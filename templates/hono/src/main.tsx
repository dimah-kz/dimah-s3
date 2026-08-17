import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@dimah-s3/ui";
import { ThemeProvider } from "@/components/theme-provider";
import { s3Client } from "@/lib/s3-client";
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
      <s3Client.Provider>
        <App />
        <Toaster />
      </s3Client.Provider>
    </ThemeProvider>
  </StrictMode>,
);
