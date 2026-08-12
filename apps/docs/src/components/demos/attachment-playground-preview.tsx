import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AttachmentPlaygroundDemo } from "@/components/demos/attachment-playground-demo";

const demosDir = join(process.cwd(), "src/components/demos");

/** Server wrapper: injects demo source so controls can sit above the preview frame. */
export function AttachmentPlaygroundPreview() {
  const code = readFileSync(
    join(demosDir, "attachment-playground-demo.tsx"),
    "utf-8",
  );

  return <AttachmentPlaygroundDemo code={code} />;
}
