---
packages:
  "@dimah-s3/ui": patch
---

### ObjectList rename field follows the page direction

The inline rename field in `ObjectList` takes its direction from the list and the page around it. In an RTL app, the field stays right-aligned even when the file name is Latin, such as `plan-final.pdf`.
