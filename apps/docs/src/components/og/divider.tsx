export interface DividerProps {
  /** Line style on either side of the optional label. */
  variant?: "solid" | "dashed";
  /** Color of the line and label. */
  color?: string;
  /** Optional text centered between two line segments. */
  label?: string;
  /** Line thickness in pixels. */
  thickness?: number;
}

/** A horizontal rule that also works inside Satori-rendered OG images. */
export const Divider = ({
  variant = "solid",
  color = "#71717a",
  label,
  thickness = 1,
}: DividerProps) => {
  const rule = `${thickness}px ${variant} ${color}`;

  return (
    <div
      style={{
        alignItems: "center",
        color,
        display: "flex",
        width: "100%",
      }}
    >
      <div style={{ borderTop: rule, display: "flex", flexGrow: 1 }} />
      {label && (
        <div style={{ display: "flex", flexShrink: 0, padding: "0 20px" }}>
          {label}
        </div>
      )}
      {label && (
        <div style={{ borderTop: rule, display: "flex", flexGrow: 1 }} />
      )}
    </div>
  );
};
