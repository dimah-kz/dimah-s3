import { useCallback, useState, type ReactNode } from "react";

/**
 * A message for a live region, and a setter that reads the same text out
 * again when it repeats. Render `notice` inside a `role="status"` element
 * that stays mounted.
 */
export function useAnnouncer(): [
  notice: ReactNode,
  announce: (text: string) => void,
] {
  const [notice, setNotice] = useState({ text: "", count: 0 });
  const announce = useCallback(
    (text: string) =>
      setNotice((current) => ({ text, count: current.count + 1 })),
    [],
  );
  return [
    // A new key makes the region read the same text again.
    notice.text ? <span key={notice.count}>{notice.text}</span> : null,
    announce,
  ];
}
