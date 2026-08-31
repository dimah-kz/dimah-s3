"use client";

import { DeleteButton } from "@dimah-s3/ui";

export function DeleteButtonDemo() {
  return (
    <DeleteButton
      route="uploads"
      objectKey="uploads/photo.jpg"
      fileName="photo.jpg"
      fileSize={1_024_000}
    />
  );
}
