---
packages:
  "@dimah-s3/db":
    replay:
      - exit-prerelease(npm:@dimah-s3/db)
---

### Copy the Drizzle schema into your app

Copy `src/drizzle/sqlite.ts`, `pg.ts`, or `mysql.ts` from the package into your schema when you want to add columns. Keep the table and column names. Importing `dimahS3Tables` from `@dimah-s3/db/drizzle/*` still works when you leave the tables as they are.
