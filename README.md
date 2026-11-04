# dimah-s3

[![npm version](https://img.shields.io/npm/v/@dimah-s3/server/beta?style=flat-square&logo=npm&logoColor=white&label=beta&color=CB3837)](https://www.npmjs.com/package/@dimah-s3/server/v/beta)
[![GitHub stars](https://img.shields.io/github/stars/dimah-kz/dimah-s3?style=flat-square&logo=github&logoColor=white&label=stars&color=F5C518)](https://github.com/dimah-kz/dimah-s3)
[![documentation](https://img.shields.io/badge/docs-s3.dimah.dev-0F766E?style=flat-square&logo=readthedocs&logoColor=white&label=documentation)](https://s3.dimah.dev/docs)

**2.0 beta** of the full-stack S3 toolkit for the React ecosystem. Install with the `beta` dist-tag. `@latest` stays on 1.x, and betas can include breaking changes until 2.0.0. 1.x docs: [v1.s3.dimah.dev](https://v1.s3.dimah.dev/docs).

Server handlers, headless React hooks, optional [shadcn](https://ui.shadcn.com)
UI, and an optional database plugin. You pass in your own AWS SDK `S3Client`.

It is presign-first: the server signs, the browser talks to the bucket, and
credentials never leave the backend. Auth, quotas, and database rules live
in server hooks.

Works with Amazon S3, Cloudflare R2, MinIO, and other S3-compatible stores.
Presign flows only. Anything else stays in your own backend with
[`@aws-sdk/client-s3`](https://www.npmjs.com/package/@aws-sdk/client-s3).

## Docs

[s3.dimah.dev](https://s3.dimah.dev/docs) ·
[Comparison](https://s3.dimah.dev/docs/comparison) ·
[llms.txt](https://s3.dimah.dev/llms.txt) (coding agents)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Report vulnerabilities via [SECURITY.md](./SECURITY.md).

## License

MIT
