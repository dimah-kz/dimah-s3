"use client";

import { DeleteButton } from "@dimah-s3/ui";

export function DeleteButtonDemo() {
  return (
    <DeleteButton
      route="uploads"
      objectKey="uploads/11111111-1111-1111-1111-111111111111/photo.jpg"
      fileName="photo.jpg"
      fileSize={1_024_000}
    />
  );
}
