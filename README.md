# dimah-s3

[![npm version](https://img.shields.io/npm/v/@dimah-s3/server?style=flat-square&logo=npm&logoColor=white&label=npm&color=CB3837)](https://www.npmjs.com/package/@dimah-s3/server)
[![GitHub stars](https://img.shields.io/github/stars/dimah-kz/dimah-s3?style=flat-square&logo=github&logoColor=white&label=stars&color=F5C518)](https://github.com/dimah-kz/dimah-s3)
[![documentation](https://img.shields.io/badge/docs-s3.dimah.dev-0F766E?style=flat-square&logo=readthedocs&logoColor=white&label=documentation)](https://s3.dimah.dev/docs)

**Full-stack S3 toolkit for the React ecosystem.**

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
