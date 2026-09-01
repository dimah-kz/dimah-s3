"use client";

import { useDelete } from "@dimah-s3/react";
import { DeleteButton } from "@dimah-s3/ui";

export function DeleteButtonDemo() {
  const del = useDelete({ route: "avatar" });

  return (
    <DeleteButton
      delete={del}
      objectKey="avatar/11111111-1111-1111-1111-111111111111/avatar.png"
      fileName="avatar.png"
      fileSize={1_024_000}
    />
  );
}
