export const TWEET_LANDSCAPE = { width: 1200, height: 675 } as const;

/** H.264/AVC needs even width and height; tweet stills stay 1200×675. */
export const TWEET_LANDSCAPE_VIDEO = { width: 1200, height: 676 } as const;

export type BrandSize = {
  width: number;
  height: number;
};

export function evenAvcSize(size: BrandSize): BrandSize {
  return {
    width: Math.round(size.width / 2) * 2,
    height: Math.round(size.height / 2) * 2,
  };
}

export const brandSectionIds = [
  "attachment",
  "upload",
  "download",
  "delete",
] as const;

export type BrandSectionId = (typeof brandSectionIds)[number];

export const brandSections: readonly {
  id: BrandSectionId;
  title: string;
}[] = [
  { id: "attachment", title: "Attachment" },
  { id: "upload", title: "Upload" },
  { id: "download", title: "Download" },
  { id: "delete", title: "Delete" },
];

export const brandKinds = ["stills", "videos"] as const;
export type BrandKind = (typeof brandKinds)[number];

export type BrandItem = {
  section: BrandSectionId;
  kind: BrandKind;
  slug: string;
  title: string;
  caption: string;
  size: BrandSize;
  ext: "png" | "jpg" | "mp4";
  fps?: number;
};

export const brandItems = [
  {
    section: "attachment",
    kind: "stills",
    slug: "tweet",
    title: "Tweet — shadcn Attachment",
    caption: "FileAttachment + StatusAttachment, 16:9 landscape.",
    size: TWEET_LANDSCAPE,
    ext: "png",
  },
  {
    section: "attachment",
    kind: "videos",
    slug: "tweet",
    title: "Tweet — shadcn Attachment",
    caption: "Cards enter, fill to 100%, then settle to done. 16:9 landscape.",
    size: TWEET_LANDSCAPE_VIDEO,
    ext: "mp4",
    fps: 30,
  },
] as const satisfies readonly BrandItem[];

export function itemId(item: Pick<BrandItem, "section" | "kind" | "slug">) {
  return `${item.section}/${item.kind}/${item.slug}`;
}

/** Stable `id` for the Editframe root timegroup (playback controls target). */
export function itemVideoId(
  item: Pick<BrandItem, "section" | "kind" | "slug">,
) {
  return itemId(item).replaceAll("/", "-");
}

export function itemHref(item: Pick<BrandItem, "section" | "kind" | "slug">) {
  return `/${item.section}/${item.kind}/${item.slug}`;
}

export function itemAsset(item: BrandItem) {
  return `/${item.section}/${item.kind}/${item.slug}.${item.ext}`;
}

export function isBrandSectionId(value: string): value is BrandSectionId {
  return (brandSectionIds as readonly string[]).includes(value);
}

export function isBrandKind(value: string): value is BrandKind {
  return (brandKinds as readonly string[]).includes(value);
}

export function getBrandSection(id: string) {
  return brandSections.find((section) => section.id === id);
}

export function getBrandItem(section: string, kind: string, slug: string) {
  return brandItems.find(
    (item) =>
      item.section === section && item.kind === kind && item.slug === slug,
  );
}

export function itemsForSection(section: BrandSectionId): BrandItem[] {
  return brandItems.filter((item) => item.section === section);
}

export function itemsFor(
  section: BrandSectionId,
  kind: BrandKind,
): BrandItem[] {
  return brandItems.filter(
    (item) => item.section === section && item.kind === kind,
  );
}
