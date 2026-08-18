import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";
import { appName, githubRepoUrl, packageVersion, xProfileUrl } from "./shared";

function XIcon() {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex flex-row items-center gap-1.75">
          <Logo />
          {appName}
          <span className="ms-0.5 rounded-full border border-fd-border bg-fd-muted/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums tracking-wide text-fd-muted-foreground">
            v{packageVersion}
          </span>
        </span>
      ),
    },
    githubUrl: githubRepoUrl(),
    links: [
      {
        type: "icon",
        url: xProfileUrl,
        text: "X",
        label: "X",
        icon: <XIcon />,
        external: true,
      },
    ],
  };
}
