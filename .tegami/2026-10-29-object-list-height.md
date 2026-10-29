---
packages:
  group:dimah-s3: minor
---

### Size the object list frame

`ObjectList` accepts `height` and `maxHeight`. A number is pixels. A string is a CSS length, such as `"18rem"` or `"100%"`. `height` keeps the frame one size. `maxHeight` lets it grow with the folder until that cap. In both cases the header and upload progress stay put, and the rows scroll inside the frame.

### Load the next page from the end of the list

`ObjectList` no longer shows a Load more button. When `list.hasMore` is set, the next page loads as the end of the rows comes into view. A short frame fills itself. Scrolling to the end loads the page after that.
