/** A `Date`, an ISO string, or epoch milliseconds. */
export type DateInput = Date | string | number;

/** Epoch milliseconds, or `null` when the value is missing or invalid. */
export function toTimestamp(
  value: DateInput | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
