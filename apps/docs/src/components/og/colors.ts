/**
 * The site's light theme (`global.css` `:root`, Fumadocs neutral) in hex.
 * Images can't read CSS variables, so change these with the theme.
 */
export const ogColors = {
  /** `--background` */
  paper: "#ffffff",
  /** `--muted`, `--secondary` */
  paperMuted: "#f5f5f5",
  /** `--foreground` */
  ink: "#0a0a0a",
  /** Body copy under a heading, between ink and muted. */
  inkSoft: "#525252",
  /** `--muted-foreground` */
  inkMuted: "#737373",
  /** `--border` */
  line: "#e5e5e5",
  /** A stronger line, for dashed outlines. */
  lineStrong: "#d4d4d4",
  /** The background grid, a step lighter than `--border`. */
  grid: "#f0f0f0",
  /** The landing demo's "In your browser" dot (`bg-emerald-500`). */
  success: "#10b981",
} as const;
