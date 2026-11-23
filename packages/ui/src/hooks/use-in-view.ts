"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * `true` once the element of `ref` has come into view, and from then on.
 * `rootMargin` widens the viewport, so work can start just before. A
 * browser without `IntersectionObserver` counts everything as in view.
 */
export function useInView(
  ref: RefObject<Element | null>,
  rootMargin = "200px",
): boolean {
  const [seen, setSeen] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof IntersectionObserver !== "function",
  );

  useEffect(() => {
    const element = ref.current;
    if (seen || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setSeen(true);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, seen]);

  return seen;
}
