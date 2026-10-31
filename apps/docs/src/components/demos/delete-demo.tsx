"use client";

import { useDelete } from "@dimah-s3/react";
import { Delete, DeleteToasts, DeleteTrigger } from "@dimah-s3/ui";

export function DeleteDemo() {
  const remove = useDelete({ route: "avatar" });

  return (
    <>
      <Delete delete={remove}>
        <DeleteTrigger
          className="w-fit self-start"
          objectKey="avatar/11111111-1111-1111-1111-111111111111/avatar.png"
          fileName="avatar.png"
          fileSize={1_024_000}
        />
      </Delete>
      <DeleteToasts delete={remove} />
    </>
  );
}
