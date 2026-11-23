export type Section = "framework" | "server" | "react" | "ui";

/** Sidebar tab of a docs path (`server/routes`, `ui/components/upload`). */
export function getSection(path: string | undefined): Section {
  const dir = path?.split("/")[0];
  if (dir === "server" || dir === "react" || dir === "ui") return dir;
  return "framework";
}

const sectionLabels: Record<Section, string | null> = {
  framework: null,
  server: "Server",
  react: "React",
  ui: "UI",
};

/**
 * Document title of a docs page. Sidebar titles stay short ("Overview",
 * "Setup", "Upload") because the tab names the package; browser tabs and
 * search results add it: "Upload – UI".
 */
export function documentTitle(title: string, path: string): string {
  const label = sectionLabels[getSection(path)];
  return label ? `${title} – ${label}` : title;
}
