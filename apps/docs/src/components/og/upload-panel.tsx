import type { ReactNode } from "react";
import { CloudUploadIcon } from "@/components/og/brand-mark";
import { ogColors as colors } from "@/components/og/colors";
import { ogFonts } from "@/components/og/render-image";

/** Lucide paths for the row icons, 24×24, stroked. */
const icons = {
  download: [
    "M12 15V3",
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m7 10 5 5 5-5",
  ],
  trash: [
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ],
  check: ["m9 12 2 2 4-4"],
  clock: ["M12 6v6l4 2"],
} as const;

/**
 * A still of the landing page's live demo (`components/home/live-demo.tsx`):
 * the dropzone, a finished upload with its download and delete actions, one
 * in progress, and one waiting.
 */
export function UploadPanel() {
  return (
    <div
      dir="ltr"
      style={{
        backgroundColor: colors.paper,
        border: `1px solid ${colors.line}`,
        borderRadius: 24,
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.04), 0 24px 48px -16px rgba(0,0,0,0.14)",
        display: "flex",
        flexDirection: "column",
        fontFamily: ogFonts.sans,
        gap: 14,
        padding: 20,
        width: 384,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          paddingInline: 4,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 500 }}>Live demo</div>
        <div
          style={{
            alignItems: "center",
            color: colors.inkMuted,
            display: "flex",
            fontSize: 15,
            gap: 8,
          }}
        >
          <div
            style={{
              backgroundColor: colors.success,
              borderRadius: 999,
              height: 8,
              width: 8,
            }}
          />
          In your browser
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          backgroundColor: colors.paperMuted,
          border: `1.5px dashed ${colors.lineStrong}`,
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "26px 20px 24px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            backgroundColor: colors.paper,
            border: `1px solid ${colors.line}`,
            borderRadius: 999,
            display: "flex",
            height: 52,
            justifyContent: "center",
            marginBottom: 4,
            width: 52,
          }}
        >
          <CloudUploadIcon color={colors.ink} size={26} strokeWidth={1.75} />
        </div>
        <div style={{ display: "flex", fontSize: 18, fontWeight: 500, gap: 6 }}>
          Drop files or
          <span style={{ textDecoration: "underline" }}>browse</span>
        </div>
        <div style={{ color: colors.inkMuted, fontSize: 15 }}>
          Up to 3 files, 75 MB each
        </div>
      </div>

      <FileRow
        ext="PNG"
        extColor="#3e63dd"
        name="team-offsite.png"
        detail="2.4 MB"
        trailing={
          <div style={{ display: "flex", gap: 14 }}>
            <Icon paths={icons.download} />
            <Icon paths={icons.trash} />
          </div>
        }
      />
      <FileRow
        ext="PDF"
        extColor="#e5484d"
        name="q3-report.pdf"
        detail={<Progress percent={64} />}
        trailing={
          <div
            style={{
              color: colors.ink,
              fontFamily: ogFonts.mono,
              fontSize: 15,
            }}
          >
            64%
          </div>
        }
      />
      <FileRow
        ext="MP4"
        extColor="#8e4ec6"
        name="product-tour.mp4"
        detail="Waiting · 48 MB"
        trailing={<Icon paths={icons.clock} circle />}
      />
    </div>
  );
}

function FileRow({
  ext,
  extColor,
  name,
  detail,
  trailing,
}: {
  ext: string;
  extColor: string;
  name: string;
  detail: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <div
      style={{
        alignItems: "center",
        border: `1px solid ${colors.line}`,
        borderRadius: 14,
        display: "flex",
        gap: 14,
        padding: "12px 16px 12px 12px",
      }}
    >
      <FileGlyph color={extColor} ext={ext} />
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: 6,
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 500 }}>{name}</div>
        {typeof detail === "string" ? (
          <div style={{ color: colors.inkMuted, fontSize: 15 }}>{detail}</div>
        ) : (
          detail
        )}
      </div>
      {trailing}
    </div>
  );
}

/** A page with a folded corner and a colored type label, like `FileTypeGlyph`. */
function FileGlyph({ ext, color }: { ext: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        height: 46,
        position: "relative",
        width: 38,
      }}
    >
      <svg height={46} viewBox="0 0 38 46" width={38}>
        <path
          d="M4 1.5h21L36.5 13v28a3.5 3.5 0 0 1-3.5 3.5H4A3.5 3.5 0 0 1 .5 41V5A3.5 3.5 0 0 1 4 1.5Z"
          fill={colors.paperMuted}
          stroke={colors.lineStrong}
        />
        <path
          d="M25 1.5V10a3 3 0 0 0 3 3h8.5"
          fill="none"
          stroke={colors.lineStrong}
        />
      </svg>
      <div
        style={{
          backgroundColor: color,
          borderRadius: 4,
          bottom: 7,
          color: colors.paper,
          display: "flex",
          fontFamily: ogFonts.sans,
          fontSize: 10,
          fontWeight: 700,
          left: -4,
          letterSpacing: "0.04em",
          padding: "2px 5px",
          position: "absolute",
        }}
      >
        {ext}
      </div>
    </div>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <div
      style={{
        backgroundColor: colors.paperMuted,
        borderRadius: 999,
        display: "flex",
        height: 6,
        marginBlock: 5,
        width: "100%",
      }}
    >
      <div
        style={{
          backgroundColor: colors.ink,
          borderRadius: 999,
          height: 6,
          width: `${percent}%`,
        }}
      />
    </div>
  );
}

function Icon({
  paths,
  circle = false,
}: {
  paths: readonly string[];
  circle?: boolean;
}) {
  return (
    <svg
      fill="none"
      height={20}
      stroke={colors.inkMuted}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={20}
    >
      {circle ? <circle cx="12" cy="12" r="10" /> : null}
      {paths.map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
