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
}

export function DocsCard({
  brand,
  label,
  title,
  description,
  layout = "page",
}: DocsCardProps) {
  const blurb = description?.trim();

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
      <GridLines color={line} inset={36} variant="solid" />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          left: 84,
          position: "absolute",
          right: 84,
          top: 68,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 14,
          }}
        >
          <BrandMark background={mark} radius={12} size={48}>
            <CloudMark />
          </BrandMark>
          <div
            style={{
              display: "flex",
              fontSize: 26,
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
            fontSize: 16,
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
          bottom: 68,
          display: "flex",
          flexDirection: "column",
          left: 84,
          position: "absolute",
          right: 84,
        }}
      >
        {layout === "cover" ? (
          <CoverTitle title={title} />
        ) : (
          <Title size={titleSize(title)}>{title}</Title>
        )}
        {blurb ? (
          <div
            style={{
              color: muted,
              display: "flex",
              fontSize: 28,
              fontWeight: 400,
              lineHeight: 1.4,
              marginTop: 24,
              maxWidth: 880,
            }}
          >
            {blurb}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CoverTitle({ title }: { title: string }) {
  const bridge = " for ";
  const at = title.indexOf(bridge);
  const lead = at === -1 ? title : title.slice(0, at);
  const tail = at === -1 ? null : title.slice(at + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Title nowrap size={64}>
        {lead}
      </Title>
      {tail ? (
        <Title nowrap size={64}>
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

function CloudMark() {
  return (
    <svg
      fill="none"
      height="26"
      stroke="#121211"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="26"
    >
      <path d="M12 13v8" />
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="m8 17 4-4 4 4" />
    </svg>
  );
}
