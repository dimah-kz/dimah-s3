import { CloudUploadIcon } from "@/components/og/brand-mark";
import { ogColors } from "@/components/og/colors";

/**
 * The app icon at full bleed: the cloud in white on ink, as in `icon.svg`.
 * Platforms round the corners of touch icons themselves.
 */
export function AppIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: ogColors.ink,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <CloudUploadIcon color={ogColors.paper} size={Math.round(size * 0.66)} />
    </div>
  );
}
