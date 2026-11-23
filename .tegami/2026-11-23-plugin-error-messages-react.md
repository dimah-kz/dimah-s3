---
packages:
  "@dimah-s3/react": minor
---

### Word plugin error codes

- **`formatError` on `S3Provider`.** Your message for an API error (`S3ErrorFormatter`). `useFormatError` and every UI toast ask it first, for plugin codes and catalog codes alike, and `undefined` keeps the built-in message. Without it, a plugin's code shows the English message the server sent.
