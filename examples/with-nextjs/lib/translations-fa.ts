import type { Translations } from "@dimah-s3/react";

/**
 * Example consumer locale pack — not shipped by `@dimah-s3/react`.
 * Keys include Fuma `note` suffixes from the library (e.g. `(API error)`).
 */
export const fa = {
  '"{name}" deleted(status)': "«{name}» حذف شد",
  "Accepted {types}.(dropzone hint)": "فرمت‌های مجاز: {types}.",
  "Access denied(API error)": "دسترسی غیرمجاز",
  "All {count} file(s) uploaded(status)": "هر {count} فایل آپلود شد",
  'Are you sure you want to delete "{name}"? This action cannot be undone.(dialog description)':
    "آیا مطمئن هستید که می‌خواهید «{name}» را حذف کنید؟ این عمل قابل بازگشت نیست.",
  "At least one upload part is required(API error)":
    "حداقل یک بخش آپلود الزامی است",
  "Cancel download(tooltip)": "لغو دانلود",
  "Cancel(dialog button)": "لغو",
  "Cancel(toast action)": "لغو",
  "Cancel(upload control)": "لغو",
  "Could not reach storage ({code})(API error)":
    "اتصال به فضای ذخیره‌سازی برقرار نشد ({code})",
  "Delete failed(status)": "حذف ناموفق بود",
  "Delete failed(toast)": "حذف ناموفق بود",
  "Delete file(tooltip)": "حذف فایل",
  "Delete file?(dialog title)": "فایل حذف شود؟",
  "Delete(button)": "حذف",
  "Delete(dialog confirm)": "حذف",
  "Download cancelled(toast)": "دانلود لغو شد",
  "Download complete(toast)": "دانلود کامل شد",
  "Download failed(status)": "دانلود ناموفق بود",
  "Download failed(toast)": "دانلود ناموفق بود",
  "Download file(tooltip)": "دانلود فایل",
  "Download started(toast)": "دانلود آغاز شد",
  "Download(button)": "دانلود",
  "Drag and drop files here(dropzone)": "فایل‌ها را اینجا بکشید و رها کنید",
  "Each up to {size}(dropzone hint)": "هر کدام حداکثر {size}",
  "File deleted(toast)": "فایل حذف شد",
  "File is empty(file validation)": "فایل خالی است",
  "File not found(API error)": "فایل یافت نشد",
  "File size exceeds {size} limit(file validation)":
    "حجم فایل از حد {size} بیشتر است",
  "File size is required(multipart)": "حجم فایل الزامی است",
  "File size is required(upload)": "حجم فایل الزامی است",
  'File type "{type}" is not allowed(file validation)':
    "نوع فایل «{type}» مجاز نیست",
  "Invalid request(API error)": "درخواست نامعتبر است",
  "Not found(API error)": "یافت نشد",
  "Object key is required(API error)": "کلید فایل الزامی است",
  "Part number must be a positive integer(API error)":
    "شماره بخش باید عدد صحیح مثبت باشد",
  "Pause(upload control)": "مکث",
  "Preparing…(upload status)": "در حال آماده‌سازی…",
  "Something went wrong(API error)": "مشکلی پیش آمد",
  "Unknown error(fallback)": "خطای ناشناخته",
  "Up to {size}(dropzone hint)": "حداکثر {size}",
  "Upload ID is required(API error)": "شناسه آپلود الزامی است",
  "Upload complete(toast)": "آپلود کامل شد",
  "Upload failed(status)": "آپلود ناموفق بود",
  "Upload failed(toast)": "آپلود ناموفق بود",
  "Upload file(button)": "آپلود فایل",
  "Upload files(button)": "آپلود فایل‌ها",
  "Upload finished with errors(toast)": "آپلود با خطا پایان یافت",
  "Uploading {done}/{total}(toast)": "در حال آپلود {done}/{total}",
  "Uploading(toast)": "در حال آپلود",
  "Validating…(upload status)": "در حال اعتبارسنجی…",
  "You can upload a file(dropzone hint)": "می‌توانید یک فایل آپلود کنید",
  "You can upload {count} files(dropzone hint)":
    "می‌توانید {count} فایل آپلود کنید",
  "{count} file(s) uploaded(toast)": "{count} فایل آپلود شد",
  "{done}/{total} files(upload progress)": "{done}/{total} فایل",
  "{name} is required(API error)": "{name} الزامی است",
  "{succeeded} succeeded, {failed} failed(toast)":
    "{succeeded} موفق، {failed} ناموفق",
} satisfies Partial<Translations>;
