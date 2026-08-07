import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";
import { appName, gitConfig, packageVersion } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex flex-row items-center gap-1.5">
          <Logo />
          {appName}
          <span className="ms-0.5 rounded-full border border-fd-border bg-fd-muted/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums tracking-wide text-fd-muted-foreground">
            v{packageVersion}
          </span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
