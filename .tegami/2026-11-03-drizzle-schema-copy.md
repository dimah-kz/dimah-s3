---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Add columns to the Drizzle tables

`runCli` → `generate` writes the Drizzle tables into your app, so you can add columns to them. Keep the table and column names. A column you add must be nullable or have a default, because the plugin does not read or write it. Generating again overwrites the file.
