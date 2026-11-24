---
packages:
  "@dimah-s3/ui": patch
---

### SharedView says a download started

`SharedView` announces "Download started" in a polite live region once the browser has the file's URL, and its Download button shows a check for two seconds, for the shared file and for each file of a shared folder. Before, a link without a download limit gave no sign, and a second press counted a second download.

- **Translation.** `"Download started(shared view)"`.
