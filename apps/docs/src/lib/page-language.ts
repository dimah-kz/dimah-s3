import { z } from "zod";

/** Languages a docs page or blog post can be written in. */
export const pageLanguages = ["en", "fa"] as const;

export type PageLanguage = (typeof pageLanguages)[number];

const languages = {
  en: { dir: "ltr", name: "English", ogLocale: "en_US" },
  fa: { dir: "rtl", name: "فارسی", ogLocale: "fa_IR" },
} as const satisfies Record<PageLanguage, unknown>;

/**
 * Frontmatter for pages in more than one language. Docs and blog schemas
 * both extend with it. The site is English: a page without `lang` is
 * English, and a translation stays out of the sidebar by being left out of
 * `meta.json`.
 */
export const pageLanguageFields = {
  /** Language the page is written in. @default "en" */
  lang: z.enum(pageLanguages).optional(),
  /** URL of this page in each other language, for hreflang and the switcher. */
  translations: z
    .object({ en: z.string().optional(), fa: z.string().optional() })
    .optional(),
  /**
   * English title for the social card. The OG renderer has no
   * right-to-left layout or Arabic-script shaping, so a Persian title
   * would render broken.
   */
  ogTitle: z.string().optional(),
  /** English description for the social card. */
  ogDescription: z.string().optional(),
};

/** `lang` and `dir` for a page's content. Empty for English, which the root sets. */
export function languageAttributes(lang: PageLanguage = "en") {
  if (lang === "en") return {};
  return { lang, dir: languages[lang].dir };
}

export function ogLocale(lang: PageLanguage = "en") {
  return languages[lang].ogLocale;
}

type Translations = Partial<Record<PageLanguage, string>>;

/** `alternates.languages` for metadata: every version, this one included. */
export function languageAlternates(
  url: string,
  lang: PageLanguage = "en",
  translations?: Translations,
): Translations | undefined {
  const others = translationLinks(translations);
  if (others.length === 0) return undefined;
  return Object.fromEntries([
    [lang, url],
    ...others.map((link) => [link.lang, link.href]),
  ]);
}

/** Other-language versions of a page, in `pageLanguages` order. */
export function translationLinks(translations?: Translations) {
  return pageLanguages.flatMap((lang) => {
    const href = translations?.[lang];
    return href ? [{ lang, href, name: languages[lang].name }] : [];
  });
}
