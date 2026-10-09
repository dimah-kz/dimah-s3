import { Badge } from "@/components/og/badge";
import { BrandMark } from "@/components/og/brand-mark";
import { GridLines } from "@/components/og/grid-lines";

const ink = "#f4f3f0";
const muted = "#a6a29b";
const labelColor = "#8f8b84";
const line = "#2e2d2b";
const canvas = "#121211";
const mark = "#f4f3f0";

export interface DocsCardProps {
  brand: string;
  label: string;
  title: string;
  description?: string;
  /** Index card uses the product tagline as the headline. */
  layout?: "cover" | "page";
  /**
   * Multiplier for type and spacing. Open Graph images stay at 1.
   * Wider canvases, such as a 5:2 article cover, pass width / 1200.
   */
  scale?: number;
  /** Title block inset from the bottom, in the 1200px-wide design. */
  contentBottom?: number;
}

export function DocsCard({
  brand,
  label,
  title,
  description,
  layout = "page",
  scale = 1,
  contentBottom = 68,
}: DocsCardProps) {
  const blurb = description?.trim();
  const px = (value: number) => Math.round(value * scale);

  return (
    <div
      style={{
        backgroundColor: canvas,
        backgroundImage:
          "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.055), transparent 55%)",
        color: ink,
        display: "flex",
        fontFamily: "Geist",
        height: "100%",
        position: "relative",
        width: "100%",
      }}
    >
      <GridLines color={line} inset={px(36)} variant="solid" />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          left: px(84),
          position: "absolute",
          right: px(84),
          top: px(68),
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: px(14),
          }}
        >
          <BrandMark background={mark} radius={px(12)} size={px(48)}>
            <CloudMark size={px(26)} />
          </BrandMark>
          <div
            style={{
              display: "flex",
              fontSize: px(26),
              fontWeight: 500,
              letterSpacing: "-0.04em",
            }}
          >
            {brand}
          </div>
        </div>
        <Badge
          color={labelColor}
          style={{
            fontSize: px(16),
            fontWeight: 500,
            letterSpacing: "0.16em",
            padding: 0,
          }}
          uppercase
        >
          {label}
        </Badge>
      </div>

      <div
        style={{
          bottom: px(contentBottom),
          display: "flex",
          flexDirection: "column",
          left: px(84),
          position: "absolute",
          right: px(84),
        }}
      >
        {layout === "cover" ? (
          <CoverTitle scale={scale} title={title} />
        ) : (
          <Title size={px(titleSize(title))}>{title}</Title>
        )}
        {blurb ? (
          <div
            style={{
              color: muted,
              display: "flex",
              fontSize: px(28),
              fontWeight: 400,
              lineHeight: 1.4,
              marginTop: px(24),
              maxWidth: px(880),
            }}
          >
            {blurb}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CoverTitle({ scale, title }: { scale: number; title: string }) {
  const px = (value: number) => Math.round(value * scale);
  const bridge = " for ";
  const at = title.indexOf(bridge);
  const lead = at === -1 ? title : title.slice(0, at);
  const tail = at === -1 ? null : title.slice(at + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: px(6) }}>
      <Title nowrap size={px(64)}>
        {lead}
      </Title>
      {tail ? (
        <Title nowrap size={px(64)}>
          {tail}
        </Title>
      ) : null}
    </div>
  );
}

function Title({
  children,
  size,
  nowrap = false,
}: {
  children: string;
  size: number;
  nowrap?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: size,
        fontWeight: 500,
        letterSpacing: "-0.045em",
        lineHeight: 1.08,
        ...(nowrap && { whiteSpace: "nowrap" }),
      }}
    >
      {children}
    </div>
  );
}

function titleSize(title: string) {
  if (title.length <= 14) return 72;
  if (title.length <= 26) return 60;
  return 52;
}

function CloudMark({ size }: { size: number }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="#121211"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 13v8" />
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="m8 17 4-4 4 4" />
    </svg>
  );
}
