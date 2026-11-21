---
packages:
  "@dimah-s3/cli":
    replay:
      - exit-prerelease(npm:@dimah-s3/cli)
---

### Starters use current dependencies

The Next.js, Vite, and Hono starters that `dimah-s3 create` scaffolds use the current releases of their dependencies.

- **Every starter** depends on `lucide-react` `^1.77.0` and `@aws-sdk/client-s3` `^3.1173.0`.
- **Next.js** uses `next` `^16.4.6`.
- **Vite and Hono** use `vite` `^8.3.8`, `hono` `^4.13.19`, and `@hono/node-server` `^2.1.11`.
