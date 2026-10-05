import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = join(dirname(fileURLToPath(import.meta.url)), "../assets/og");

function load(file: string) {
  return readFile(join(directory, file));
}

async function loadOgFonts() {
  const [regular, medium, serif, serifItalic] = await Promise.all([
    load("Geist-Regular.ttf"),
    load("Geist-Medium.ttf"),
    load("InstrumentSerif-Regular.ttf"),
    load("InstrumentSerif-Italic.ttf"),
  ]);

  return [
    {
      name: "Geist",
      data: regular,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Geist",
      data: medium,
      weight: 500 as const,
      style: "normal" as const,
    },
    {
      name: "Instrument Serif",
      data: serif,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Instrument Serif",
      data: serifItalic,
      weight: 400 as const,
      style: "italic" as const,
    },
  ];
}

let fonts: ReturnType<typeof loadOgFonts> | undefined;

export function ogFonts() {
  fonts ??= loadOgFonts();
  return fonts;
}
