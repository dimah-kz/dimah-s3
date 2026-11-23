import { ogColors } from "@/components/og/colors";

/** Lucide `cloud-upload`, the `Logo` in the header and `icon.svg`. 24×24, stroked. */
const cloudUploadPaths = [
  "M12 13v8",
  "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
  "m8 17 4-4 4 4",
] as const;

export function CloudUploadIcon({
  size,
  color,
  strokeWidth = 2,
}: {
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {cloudUploadPaths.map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

/**
 * The app icon: the cloud in white on an ink tile, as in `icon.svg`. The
 * corner radius keeps the favicon's 7/32 ratio.
 */
export function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: ogColors.ink,
        borderRadius: Math.round((size * 7) / 32),
        display: "flex",
        flexShrink: 0,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <CloudUploadIcon color={ogColors.paper} size={Math.round(size * 0.6)} />
    </div>
  );
}
