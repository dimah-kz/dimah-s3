"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";
import type { S3Api, S3RouteName } from "@dimah-s3/core";
import { useObjectUrl } from "@dimah-s3/react";

/** Props for {@link ObjectImage}. Other props go to the `<img>`. */
export type ObjectImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
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
 * URL is signed, when signing fails and when the image fails to load.
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
  ...props
}: ObjectImageProps) {
  const { url } = useObjectUrl({ api, route, objectKey });
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (url == null || url === brokenUrl) return fallback;

  return (
    <img
      data-slot="object-image"
      {...props}
      src={url}
      alt={alt}
      onError={(event) => {
        setBrokenUrl(url);
        onError?.(event);
      }}
    />
  );
}
