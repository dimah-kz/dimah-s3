---
packages:
  group:dimah-s3: patch
---

### Fix shadcn registry installs

Installing `@dimah-s3/*` UI items no longer rewrites layout helpers onto the stock Attachment primitive. Upload items ship the reject-toast hook, `@fuma-translate/react` and `react-file-icon` types install automatically, and dimah color tokens are injected into the project CSS.
