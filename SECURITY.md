# Security Policy

## Supported versions

Fixes ship in the newest 2.x release. Upgrade to it before reporting.

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | No        |
| 0.x     | No        |

1.x reached end of life with 2.0.0 and gets no more releases, including security fixes. Move to 2.x with the [upgrade guide](https://s3.dimah.dev/docs/migration-2-0).

## Reporting a vulnerability

Report vulnerabilities privately with [GitHub private vulnerability reporting](https://github.com/dimah-kz/dimah-s3/security/advisories/new). Include:

- A clear description of the issue
- Steps to reproduce
- Potential impact
- Any suggested mitigation

Do not open a public issue, and never include real S3 credentials, `DIMAH_S3_SECRET` values, or live presigned URLs.

We aim to acknowledge reports quickly and share a remediation plan after triage.
