import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { render, type RenderInput, type RenderOptions } from "takumi-js";

/** Family names for `fontFamily`, as on the site: Geist, Geist Mono, and Vazirmatn for Persian. */
export const ogFonts = {
  sans: "Geist",
  mono: "Geist Mono",
  persian: "Vazirmatn",
} as const;

// Read once, at module scope, so prerendering sees no I/O. The path starts at
// the app root (`process.cwd()`), as in the Next.js metadata docs: Turbopack
// turns `new URL(…, import.meta.url)` into a public `/_next/static` URL.
// Scripts that render cards (`scripts/x-cover.tsx`) run from `apps/docs` too.
const fontsDir = join(process.cwd(), "src/assets/og");
const readFont = (file: string) => readFile(join(fontsDir, file));

const [geistLatin, geistLatinExt, geistMono, vazirmatn] = await Promise.all([
  readFont("geist-latin.woff2"),
  readFont("geist-latin-ext.woff2"),
  readFont("geist-mono-latin.woff2"),
  readFont("vazirmatn-variable.woff2"),
]);

/** Google Fonts' `latin` subset, the file `next/font` serves the site. */
const latin: [number, number][] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** Google Fonts' `latin-ext` subset. */
const latinExt: [number, number][] = [
  [0x0100, 0x02ba],
  [0x02bd, 0x02c5],
  [0x02c7, 0x02cc],
  [0x02ce, 0x02d7],
  [0x02dd, 0x02ff],
  [0x1d00, 0x1dbf],
  [0x1e00, 0x1e9f],
  [0x1ef2, 0x1eff],
  [0x2020, 0x2020],
  [0x20a0, 0x20ab],
  [0x20ad, 0x20c0],
  [0x2113, 0x2113],
  [0x2c60, 0x2c7f],
  [0xa720, 0xa7ff],
];

/**
 * Vazirmatn serves Arabic script only, like the site's `arabic` subset, so
 * Latin words inside Persian text stay in Geist. The zero-width non-joiner
 * (U+200C) is in range: Persian words break without it.
 */
const arabic: [number, number][] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x0870, 0x08ff],
  [0x200c, 0x200f],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];

/**
 * Variable fonts registered without a `weight` keep their axes live, so
 * `fontWeight` picks any weight they have (Geist 100–900, Vazirmatn 100–900).
 */
const fonts = [
  { name: ogFonts.sans, data: geistLatin, unicodeRange: latin },
  { name: ogFonts.sans, data: geistLatinExt, unicodeRange: latinExt },
  { name: ogFonts.mono, data: geistMono, unicodeRange: latin },
  { name: ogFonts.persian, data: vazirmatn, unicodeRange: arabic },
] satisfies RenderOptions["fonts"];

/**
 * Renders JSX to PNG bytes. Every generated image (share cards, icons, the X
 * cover) goes through it, so the engine and fonts change in one file. Takumi
 * shapes Persian and lays out right-to-left text; `next/og` (Satori) does not.
 *
 * Call it inside a `'use cache'` function. Takumi renders on a native thread,
 * which Cache Components counts as request-time work, so without the cache the
 * route renders on every request instead of once at build.
 */
export async function renderImage(
  element: RenderInput,
  options: RenderOptions = {},
) {
  const image = await render(element, { ...options, fonts });

  // A plain `Uint8Array`, so a `'use cache'` entry can hold it.
  return new Uint8Array(image);
}
