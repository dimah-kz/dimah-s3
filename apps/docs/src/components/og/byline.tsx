import { ogColors as colors } from "@/components/og/colors";
import { ogFonts } from "@/components/og/render-image";

/** As the blog prints dates (`components/blog`), so the card and the page agree. */
const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/**
 * A post's author and date, for the end of a blog card's footer. `avatar` is
 * a data URI: images render from bytes, not from the site's URLs.
 */
export function Byline({
  name,
  avatar,
  date,
}: {
  name: string;
  avatar?: string;
  date?: Date;
}) {
  return (
    <div
      dir="ltr"
      style={{
        alignItems: "center",
        color: colors.inkMuted,
        display: "flex",
        fontFamily: ogFonts.sans,
        fontSize: 21,
        gap: 12,
      }}
    >
      {avatar ? (
        // Takumi draws `img`; next/image has nothing to optimize here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          height={36}
          src={avatar}
          style={{ border: `1px solid ${colors.line}`, borderRadius: 999 }}
          width={36}
        />
      ) : null}
      <span style={{ color: colors.ink, fontWeight: 500 }}>{name}</span>
      {date ? (
        <>
          <span>·</span>
          <span>{dateFormat.format(date)}</span>
        </>
      ) : null}
    </div>
  );
}
