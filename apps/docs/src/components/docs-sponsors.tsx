import { Marquee } from "@fumari/sponsors";
import { ArrowRight } from "lucide-react";
import "@fumari/sponsors/style.css";

/** Official nothing.pub symbol. Fill follows the text color. */
const nothingSymbolPath =
  "M214.6838 263.5512C209.9609 261.8668 207.5991 259.7822 205.5708 255.508C204.1914 252.601 204 243.9886 204 184.8108C204 117.4238 204 117.4238 201.75 112.9619C199.6697 108.8365 198.2933 107.8326 183.5 99.6499C152.6323 82.5759 104.3757 56.2327 91.7214 49.5479C77.4852 42.0276 74.9953 41.7061 73.0999 47.1432C72.3372 49.3311 72 73.6724 72 126.535C72 202.7716 72 202.7716 69.25 207.9972C66.6343 212.9677 65.171 214.1011 39.278 231.2114C16.1936 246.4658 11.4878 249.2 8.3182 249.2C3.72 249.2 1.36 246.6369 0.4983 240.7069C0.162 238.3931 0.0249 203.65 0.1935 163.5C0.5293 83.5285 0.2182 87.6258 6.521 80.1506C9.3799 76.7599 31.1213 61.8012 47.3617 52.051C52.2357 49.1249 59.7524 45.2647 64.0655 43.4728C69.0737 41.3921 74.8939 37.8254 80.1719 33.6025C100.9925 16.944 123.5735 2.6455 131.7379 0.9506C140.4811 -0.8645 145.963 0.7717 165.9088 11.1495C203.4825 30.6991 270.6665 67.2526 276.1883 71.1506C277.6668 72.1943 280.1418 75.6249 281.6883 78.7741C284.5 84.5 284.5 84.5 284.5 153.5C284.5 222.5 284.5 222.5 282.1371 227C280.8376 229.475 278.8126 232.5502 277.6371 233.8339C274.5673 237.1863 232.4594 262.0575 227.1463 263.6565C221.6552 265.3091 219.5631 265.2914 214.6838 263.5512Z";

const sponsor = {
  name: "nothing.pub",
  href: "https://nothing.pub",
} as const;

/** Sponsor card under the docs table of contents. Same scrolling logo row as `@fumari/sponsors`. */
export function DocsSponsors() {
  return (
    <div className="fumari-sponsors-marquee mt-2 shrink-0">
      <a
        href={sponsor.href}
        target="_blank"
        rel="sponsored noreferrer noopener"
        className="fumari-sponsors-marquee-heading"
      >
        Sponsors
        <ArrowRight aria-hidden className="size-3.5" />
      </a>
      <Marquee pauseOnHover className="fumari-sponsors-marquee-track">
        <SponsorLink />
      </Marquee>
    </div>
  );
}

function SponsorLink() {
  return (
    <a
      href={sponsor.href}
      target="_blank"
      rel="sponsored noreferrer noopener"
      className="fumari-sponsors-marquee-item"
    >
      <svg
        aria-hidden
        viewBox="0 -1 285 267"
        className="size-5 shrink-0"
        fill="currentColor"
      >
        <path d={nothingSymbolPath} />
      </svg>
      {sponsor.name}
    </a>
  );
}
