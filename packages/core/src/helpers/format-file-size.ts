/** Binary size units used by {@link formatFileSize}. */
export type FileSizeUnit = "B" | "KB" | "MB" | "GB" | "TB" | "PB" | "EB";

const UNITS: readonly FileSizeUnit[] = [
  "B",
  "KB",
  "MB",
  "GB",
  "TB",
  "PB",
  "EB",
];

/** Options for {@link formatFileSize}. */
export type FormatFileSizeOptions = {
  /**
   * Locale for digits and the decimal mark, such as `"fa"` for `۱۲٫۴`.
   * @default "en-US"
   */
  locale?: string | readonly string[];
  /** Unit labels, such as translated ones. Missing units stay `B`, `KB`, … */
  units?: Partial<Record<FileSizeUnit, string>>;
};

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(
  locale: string | readonly string[],
  fractionDigits: number,
): Intl.NumberFormat {
  const id = `${String(locale)}|${fractionDigits}`;
  let format = numberFormats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(
      typeof locale === "string" ? locale : [...locale],
      {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
        useGrouping: false,
      },
    );
    numberFormats.set(id, format);
  }
  return format;
}

/**
 * Formats a byte count with 1024-based units: `1.2 MB`, `512 B`.
 * Pass `locale` for native digits and `units` for translated labels.
 */
export function formatFileSize(
  bytes: number,
  options: FormatFileSizeOptions = {},
): string {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const i =
    size === 0
      ? 0
      : Math.min(Math.floor(Math.log(size) / Math.log(1024)), UNITS.length - 1);
  const unit = UNITS[i] ?? "B";
  const value = numberFormat(options.locale ?? "en-US", i === 0 ? 0 : 1).format(
    size / 1024 ** i,
  );
  return `${value} ${options.units?.[unit] ?? unit}`;
}
