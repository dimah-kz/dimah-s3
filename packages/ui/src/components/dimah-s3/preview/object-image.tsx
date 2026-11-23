"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import type { S3Api, S3RouteName } from "@dimah-s3/core";
import { useObjectUrl } from "@dimah-s3/react";

/** Props for {@link ObjectImage}. Other props go to the `<img>`. */
export type ObjectImageProps = Omit<ComponentProps<"img">, "src"> & {
  /** Named server route that presigns the GET. */
  route: S3RouteName;
  /** Stored object key. `null` shows `fallback`. */
  objectKey: string | null;
  /** Required. Pass `""` when the image is decorative. */
  alt: string;
  /** Optional when an `<S3Provider>` is in the tree. */
  api?: S3Api;
  /** Shown while there is no key, while the URL is signed, and on errors. */
  fallback?: ReactNode;
};

/**
 * Image of a stored object. It presigns an inline URL with `useObjectUrl`,
 * which refreshes it before it expires and shares it with other images of
 * the same object.
 *
 * `fallback` renders instead of the image while there is no key, while the
 * URL is signed, and when signing fails. An image that fails to load is
 * signed again once, as a URL that expired while the tab slept would be;
 * when the new URL fails too, `fallback` shows.
 *
 * @example
 * ```tsx
 * <ObjectImage route="avatars" objectKey={user.avatarKey} alt={user.name} />
 * ```
 */
export function ObjectImage({
  route,
  objectKey,
  alt,
  api,
  fallback = null,
  onError,
  onLoad,
  ...props
}: ObjectImageProps) {
  const { url, refresh } = useObjectUrl({ api, route, objectKey });
  // The URL that failed to load, and whether its key was signed again since
  // an image last loaded.
  const [failure, setFailure] = useState<{
    objectKey: string | null;
    url: string;
    retried: boolean;
  } | null>(null);

  if (url == null || failure?.url === url) return fallback;

  return (
    <img
      data-slot="object-image"
      {...props}
      src={url}
      alt={alt}
      onLoad={(event) => {
        if (failure) setFailure(null);
        onLoad?.(event);
      }}
      onError={(event) => {
        onError?.(event);
        const retried = failure?.objectKey === objectKey && failure.retried;
        setFailure({ objectKey, url, retried: true });
        if (!retried) refresh();
      }}
    />
  );
}
