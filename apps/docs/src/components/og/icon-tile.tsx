import { createElement } from "react";
import { BookOpen, icons, type IconNode } from "lucide";
import { ogColors as colors } from "@/components/og/colors";

/** 5 × 5 cells of the card's 40px grid. */
const tileSize = 200;

/**
 * A Lucide icon by name, as frontmatter and `meta.json` write them, or
 * `BookOpen` for none. Icons come from `lucide`, plain SVG data: the
 * `lucide-react` components render through a client component, which a
 * route handler can't call.
 */
export function lucideIcon(name?: string): IconNode {
  return (name && icons[name as keyof typeof icons]) || BookOpen;
}

/** An icon on a raised tile, for the end side of a card. */
export function IconTile({ icon }: { icon: IconNode }) {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: colors.paper,
        border: `1px solid ${colors.line}`,
        borderRadius: 40,
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.04), 0 24px 48px -16px rgba(0,0,0,0.12)",
        display: "flex",
        height: tileSize,
        justifyContent: "center",
        width: tileSize,
      }}
    >
      <svg
        fill="none"
        height={88}
        stroke={colors.ink}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        width={88}
      >
        {icon.map(([tag, attrs], index) =>
          createElement(tag, { ...attrs, key: index }),
        )}
      </svg>
    </div>
  );
}
