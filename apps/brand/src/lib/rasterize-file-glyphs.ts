import type { EFTimegroupElement } from "@editframe/elements";

/** FileTypeGlyph is `media > span > svg`. Progress rings live in an overlay div. */
const FILE_GLYPH_SVG = "[data-slot=attachment-media] > span svg";

const pngCache = new Map<string, string>();

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize file glyph."));
    img.src = src;
  });
}

function layoutSize(svg: SVGSVGElement) {
  const width = Math.max(0, Math.round(svg.clientWidth));
  const height = Math.max(0, Math.round(svg.clientHeight));
  return { width, height };
}

function rewriteSvgIds(svg: SVGSVGElement) {
  const ids = [...svg.querySelectorAll("[id]")];
  const map = new Map<string, string>();
  ids.forEach((el, i) => {
    const oldId = el.getAttribute("id");
    if (!oldId) return;
    const next = `g${String(i)}`;
    map.set(oldId, next);
    el.setAttribute("id", next);
  });
  if (map.size === 0) return;

  const rewrite = (value: string) => {
    let next = value;
    for (const [oldId, newId] of map) {
      next = next.replaceAll(`url(#${oldId})`, `url(#${newId})`);
      next = next.replaceAll(`url('#${oldId}')`, `url(#${newId})`);
      next = next.replaceAll(`url("#${oldId}")`, `url(#${newId})`);
    }
    return next;
  };

  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of ["clip-path", "fill", "stroke", "mask", "filter"]) {
      const value = el.getAttribute(attr);
      if (value?.includes("url(#")) el.setAttribute(attr, rewrite(value));
    }
    const style = el.getAttribute("style");
    if (style?.includes("url(#")) el.setAttribute("style", rewrite(style));
  }
}

async function svgToPng(svg: SVGSVGElement, width: number, height: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  rewriteSvgIds(clone);
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const image = await loadImage(href);
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function glyphKey(svg: SVGSVGElement, width: number, height: number) {
  const name =
    svg
      .closest("[data-slot=attachment]")
      ?.querySelector("[data-slot=attachment-title]")
      ?.textContent?.trim() ?? "";
  return `${name}:${String(width)}x${String(height)}`;
}

async function replaceGlyph(svg: SVGSVGElement) {
  const { width, height } = layoutSize(svg);
  if (width < 2 || height < 2) return;
  const key = glyphKey(svg, width, height);
  let png = pngCache.get(key);
  if (!png) {
    png = (await svgToPng(svg, width, height)) ?? undefined;
    if (!png) return;
    pngCache.set(key, png);
  }
  if (!svg.isConnected) return;
  const img = document.createElement("img");
  img.alt = "";
  img.width = width;
  img.height = height;
  img.style.width = `${String(width)}px`;
  img.style.height = `${String(height)}px`;
  img.style.display = "block";
  img.src = png;
  await img.decode().catch(() => undefined);
  if (!svg.isConnected) return;
  svg.replaceWith(img);
}

async function rasterizeFileGlyphs(root: ParentNode) {
  const svgs = [...root.querySelectorAll<SVGSVGElement>(FILE_GLYPH_SVG)];
  await Promise.all(svgs.map((svg) => replaceGlyph(svg)));
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function uploadPhase(time: number, start: number, full: number, done: number) {
  if (time >= done) return { state: "done" as const, percent: 100 };
  if (time < start) return { state: "idle" as const, percent: 0 };
  const span = full - start;
  const linear = span <= 0 ? 1 : Math.min(1, (time - start) / span);
  return {
    state: "uploading" as const,
    percent: (1 - (1 - linear) ** 2) * 100,
  };
}

/**
 * Export seeks move the timegroup clock without a matching React render in
 * the offscreen clone. Bake each card's ring from the seek time so the
 * captured frame shows progress and the finished state.
 */
function syncUploadCards(root: ParentNode, time: number) {
  for (const card of root.querySelectorAll<HTMLElement>("[data-upload-card]")) {
    const start = Number(card.dataset.uploadStart);
    const full = Number(card.dataset.uploadFull);
    const done = Number(card.dataset.uploadDone);
    if (![start, full, done].every(Number.isFinite)) continue;

    const phase = uploadPhase(time, start, full, done);
    const attachment = card.querySelector<HTMLElement>(
      "[data-slot=attachment]",
    );
    if (attachment) attachment.dataset.state = phase.state;

    const circle = card.querySelector<SVGCircleElement>(
      "circle[stroke-dashoffset]",
    );
    const overlay = circle?.closest("svg")?.parentElement;
    if (!circle || !overlay) continue;

    if (phase.state === "done") {
      overlay.style.display = "none";
      continue;
    }

    overlay.style.display = "";
    const span = Number(circle.getAttribute("stroke-dasharray"));
    if (!Number.isFinite(span)) continue;
    const offset = String(span - (phase.percent / 100) * span);
    circle.style.transition = "none";
    circle.setAttribute("stroke-dashoffset", offset);
  }
}

/**
 * Editframe MP4 capture serializes nested SVG `clipPath="url(#id)"` incorrectly.
 * Flatten file glyphs to PNG in the export clone only — live preview stays SVG.
 * React remounts glyphs after each `seekForRender`; patch seek so capture
 * always sees the rasterized `<img>`.
 */
export function patchFileGlyphsForExport(timegroup: EFTimegroupElement) {
  pngCache.clear();
  const originalSeek = timegroup.seekForRender.bind(timegroup);

  timegroup.seekForRender = async (time, options) => {
    await originalSeek(time, options);
    await waitForPaint();
    await rasterizeFileGlyphs(timegroup);
    syncUploadCards(timegroup, time);
  };

  return () => {
    timegroup.seekForRender = originalSeek;
  };
}
