"use client";

import { useDelete } from "@dimah-s3/react";
import { DeleteButton } from "@dimah-s3/ui";

export function DeleteButtonDemo() {
  const del = useDelete({ route: "uploads" });

  return (
    <DeleteButton
      delete={del}
      objectKey="uploads/11111111-1111-1111-1111-111111111111/photo.jpg"
      fileName="photo.jpg"
      fileSize={1_024_000}
    />
  );
}
