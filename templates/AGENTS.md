<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ 
from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved 
from this file's directory; in monorepos the `next` package may not be visible from the repo 
root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/
lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted 
change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


# templates/

User-facing starters (degit / future `@dimah-s3/cli`). Not part of the pnpm workspace.

- **Edit here** when changing what consumers scaffold.
- **`examples/*`** stay on `workspace:*` for monorepo demos — do not merge the two roles.
- New template → add `templates/<id>/` and document the degit one-liner.
- Never depend on `@workspace/eslint-config` or `@workspace/typescript-config`; keep tsconfig/eslint self-contained.
