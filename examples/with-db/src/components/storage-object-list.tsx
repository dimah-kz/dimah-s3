"use client";

import * as React from "react";
import { Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "./s3-provider";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** DB-backed object list — reads via the `db` client plugin endpoint. */
export function StorageObjectList({ refreshToken }: { refreshToken: number }) {
  const api = useApi();
  const [data, setData] = React.useState<Awaited<
    ReturnType<typeof api.db.listObjects>
  > | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setData(await api.db.listObjects({ limit: 50 }));
  }, [api]);

  React.useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function handleDownload(
    object: NonNullable<typeof data>["objects"][number],
  ) {
    const { url } = await api.download(object.key, {
      fileName: object.filename ?? undefined,
      bucket: object.bucket,
    });
    window.open(url, "_blank", "noopener");
  }

  async function handleDelete(
    object: NonNullable<typeof data>["objects"][number],
  ) {
    setBusyKey(object.key);
    try {
      await api.delete(object.key, { bucket: object.bucket });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading files…</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{data.scope}</span> —{" "}
        {data.usage.objectCount} object(s), {formatBytes(data.usage.totalBytes)}
      </p>
      {data.objects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.objects.map((object) => (
              <TableRow key={object.id}>
                <TableCell className="max-w-64 truncate font-medium">
                  {object.filename ?? object.key}
                </TableCell>
                <TableCell>
                  {formatBytes(object.size ?? object.declaredSize)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={object.status === "active" ? "default" : "outline"}
                  >
                    {object.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={object.status !== "active"}
                      onClick={() => void handleDownload(object)}
                      aria-label={`Download ${object.filename ?? object.key}`}
                    >
                      <Download />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyKey === object.key}
                      onClick={() => void handleDelete(object)}
                      aria-label={`Delete ${object.filename ?? object.key}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
