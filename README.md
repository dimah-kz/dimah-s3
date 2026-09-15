# dimah-s3

[![npm](https://img.shields.io/npm/v/@dimah-s3/server?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@dimah-s3/server)
[![stars](https://img.shields.io/github/stars/dimah-kz/dimah-s3?style=flat&colorA=000000&colorB=000000)](https://github.com/dimah-kz/dimah-s3)
[![license](https://img.shields.io/github/license/dimah-kz/dimah-s3?style=flat&colorA=000000&colorB=000000)](LICENSE)

[Docs](https://s3.dimah.dev/docs) · [Issues](https://github.com/dimah-kz/dimah-s3/issues)

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

## License

MIT
