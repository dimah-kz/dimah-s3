export function getSection(path: string | undefined) {
  if (!path) return "framework";
  const parts = path.split("/");
  const [dir, sub] = parts;
  if (!dir) return "framework";
  if (dir === "react" && sub === "ui") return "framework";
  return (
    {
      server: "server",
      react: "react",
    }[dir] ?? "framework"
  );
}
