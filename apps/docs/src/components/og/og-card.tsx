import type { ReactNode } from "react";
import { BrandMark } from "@/components/og/brand-mark";
import { ogColors as colors } from "@/components/og/colors";
import { ogFonts } from "@/components/og/render-image";
import type { PageLanguage } from "@/lib/page-language";
import { appName } from "@/lib/shared";
import { PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";

/** Share images are 1200×630, the size Open Graph and X large cards expect. */
export const ogSize = { width: 1200, height: 630 } as const;

/** Cards name the canonical host, whichever deploy rendered them. */
const host = new URL(PRODUCTION_SITE_ORIGIN).host;

/** Side margin of the card, in px. The art keeps the same margin on its side. */
const inset = 72;

/** Grid pitch of the background, in px. */
const gridSize = 40;

export interface OgCardProps {
  /** Language of the copy. Persian lays out right to left in Vazirmatn. */
  lang?: PageLanguage;
  /** Short label above the title, after a hairline: the section or "Blog". */
  eyebrow?: string;
  title: string;
  /**
   * Second title line in muted ink, as the landing page sets its heading.
   * With it, both lines keep to one line each at `heroTitleSize`.
   */
  titleTail?: string;
  description?: string;
  /** Path after the host in the footer, like `/docs/server/security`. */
  path?: string;
  /** Next to the brand, like the version. Latin, in Geist Mono. */
  badge?: string;
  /** Footer end, like the post's author and date. */
  meta?: ReactNode;
  /** Drawing on the end side, centered on the card's height. */
  art?: ReactNode;
}

/**
 * The hero title's size: "for the React ecosystem" is 10.8em wide in Geist
 * semibold, which fills the text column beside the upload panel.
 */
const heroTitleSize = 58;

/**
 * The share card, in the site's light theme: white, a drafting grid that
 * fades out from the top corner, and Geist set like the site's headings. It
 * lays out in the copy's direction, so a Persian card reads right to left.
 * Title and description stop at two lines each.
 */
export function OgCard({
  lang = "en",
  eyebrow,
  title,
  titleTail,
  description,
  path = "",
  badge,
  meta,
  art,
}: OgCardProps) {
  const rtl = lang === "fa";
  const fontFamily = rtl ? `${ogFonts.persian}, ${ogFonts.sans}` : ogFonts.sans;
  const size = titleTail ? heroTitleSize : titleSize(title, Boolean(art));

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      lang={lang}
      style={{
        backgroundColor: colors.paper,
        // Fades the grid from the top corner on the end side, so the copy
        // sits on plain white.
        backgroundImage: [
          `radial-gradient(ellipse 80% 110% at ${rtl ? "0%" : "100%"} 0%, transparent 0%, ${colors.paper} 75%)`,
          `linear-gradient(to right, ${colors.grid} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${colors.grid} 1px, transparent 1px)`,
        ].join(", "),
        backgroundSize: `100% 100%, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`,
        color: colors.ink,
        display: "flex",
        fontFamily,
        height: "100%",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-between",
          minWidth: 0,
          paddingBlock: 64,
          paddingInlineEnd: art ? 44 : inset,
          paddingInlineStart: inset,
        }}
      >
        <Brand badge={badge} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow ? <Eyebrow rtl={rtl}>{eyebrow}</Eyebrow> : null}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: size,
              fontWeight: 600,
              // The site's `tracking-[-0.035em]`; tracking pulls joined scripts apart.
              letterSpacing: rtl ? 0 : "-0.04em",
              lineHeight: rtl ? 1.35 : 1.08,
            }}
          >
            {titleTail ? (
              <>
                <div style={{ whiteSpace: "nowrap" }}>{title}</div>
                <div style={{ color: colors.inkMuted, whiteSpace: "nowrap" }}>
                  {titleTail}
                </div>
              </>
            ) : (
              <div style={{ lineClamp: 2, textWrap: "balance" }}>{title}</div>
            )}
          </div>
          {description ? (
            <div
              style={{
                color: colors.inkSoft,
                fontSize: 28,
                lineClamp: 2,
                lineHeight: rtl ? 1.65 : 1.45,
                marginTop: 22,
                maxWidth: 860,
                textWrap: "pretty",
              }}
            >
              {description}
            </div>
          ) : null}
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 24,
            justifyContent: "space-between",
          }}
        >
          <div
            dir="ltr"
            style={{
              color: colors.inkMuted,
              display: "flex",
              fontFamily: ogFonts.mono,
              fontSize: 21,
            }}
          >
            <span style={{ color: colors.ink }}>{host}</span>
            {path}
          </div>
          {meta}
        </div>
      </div>

      {art ? (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexShrink: 0,
            paddingInlineEnd: inset,
          }}
        >
          {art}
        </div>
      ) : null}
    </div>
  );
}

/** The logo lockup reads left to right in either direction, on the start edge. */
function Brand({ badge }: { badge?: string }) {
  return (
    <div
      dir="ltr"
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        display: "flex",
        gap: 16,
      }}
    >
      <BrandMark size={48} />
      <div
        style={{
          fontFamily: ogFonts.sans,
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: "-0.03em",
        }}
      >
        {appName}
      </div>
      {badge ? (
        <div
          style={{
            border: `1px solid ${colors.line}`,
            borderRadius: 999,
            color: colors.inkMuted,
            fontFamily: ogFonts.mono,
            fontSize: 18,
            marginInlineStart: 4,
            padding: "4px 12px",
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
}

function Eyebrow({ children, rtl }: { children: string; rtl: boolean }) {
  return (
    <div
      style={{
        alignItems: "center",
        color: colors.inkMuted,
        display: "flex",
        fontSize: 24,
        fontWeight: 500,
        gap: 16,
        letterSpacing: rtl ? 0 : "-0.01em",
        marginBottom: 22,
      }}
    >
      <div style={{ backgroundColor: colors.ink, height: 2, width: 32 }} />
      {children}
    </div>
  );
}

/** Short titles are set large; longer ones step down so two lines hold them. */
function titleSize(title: string, narrow: boolean) {
  const length = title.length * (narrow ? 1.3 : 1);
  if (length <= 20) return 92;
  if (length <= 40) return 72;
  return 60;
}
