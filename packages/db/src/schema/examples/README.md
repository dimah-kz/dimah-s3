# Schema examples

Copy-paste `storage_object` + recommended indexes. Not imported at runtime.

| File                               | ORM              |
| ---------------------------------- | ---------------- |
| [`drizzle.ts`](./drizzle.ts)       | Drizzle (SQLite) |
| [`schema.prisma`](./schema.prisma) | Prisma           |

Docs: [Setup](https://dimah-s3.vercel.app/docs/db/setup). Drizzle needs `fumadb/cuid` → `@paralleldrive/cuid2` in tsconfig paths.
