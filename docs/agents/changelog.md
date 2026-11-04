# Changelogs

Prose rules for `.tegami/*.md`. Version lines, the publish lock, peers, and who bumps stay in [release.md](./release.md).

The same Markdown is read twice on `v2`. The version action writes it into that beta's `CHANGELOG.md`, then keeps the file as `exit-prerelease` replay. Leaving the beta appends that body again, under `2.0.0`, and deletes the file. Write the sentence you still want next to every other replayed note in the stable section.

## Reader

Someone who installs the package and has to decide whether to upgrade. Name the package, the call, and the result. Present tense. Instructions use "you" only when the sentence is a step.

Leave out the pull request, the commit, "we", and file paths inside `packages/`. A behavior with no import, hook, prop, error code, or build output for the consumer does not get a file.

## Shape

Set the bump in frontmatter. The entry title is always `###`, so a heading cannot change the bump. `#### Breaking changes` is a subsection of that entry.

```md
---
packages:
  "@dimah-s3/server": minor
---

### Signed upload tickets

Presign and multipart init return a signed ticket. Confirm and every later multipart call send only `{ ticket }`.

#### Breaking changes

- **A secret is required for uploads.** Set `DIMAH_S3_SECRET` (`openssl rand -base64 32`) or pass `dimahS3({ secret })`. Use the same value on every instance.
```

A line-wide overview uses `group:dimah-s3` and links the upgrade page. The package file holds that package's contract. The group file does not repeat it.

```md
---
packages:
  group:dimah-s3: major
---

### Folder ids in db()

`@dimah-s3/db` schema `2.1.0` addresses a folder by id. Each package changelog lists its own changes. The [upgrade guide](https://s3.dimah.dev/docs/migration-2-0) walks through the move.
```

Title: the outcome, sentence case, no period. `Signed upload tickets`, `Proxy downloads finish`, `Next.js starter lints on TypeScript 6`.

Lead: one or two sentences. What the consumer can do, or what they must change.

Bullets: `- **Name.**` then the fact. One fact per bullet. Names, codes, and paths in backticks. A long migration links the docs page and keeps the steps that the page does not replace.

## Breaking changes

Every consumer break is a `#### Breaking changes` bullet, including on `v2`, where the published version stays `2.0.0-beta.N` after the line has started.

- **Lead with the action.** Then `old` → `new`, or the step that replaces the old call.
- One rename, one bullet. Group a family under one bold label with nested bullets (`**useDelete.**`, then the per-call changes).
- A removed export names its replacement in the same bullet.
- A new peer, a required option, and a status or error-code change are breaks.
- An additive export with a default that keeps old calls working is a normal bullet, not a break.

## One file, one concern

`YYYY-MM-DD-slug.md`. Slug is the outcome (`folder-ids`, `base64url-direct`), not the version.

A later beta that replaces a contract gets its own file. Then edit the **body** of the earlier replay file so the stable section describes the final contract once. The published `2.0.0-beta.N` section in `CHANGELOG.md` stays the history of that beta. Do not edit `packages/*/CHANGELOG.md` or `.tegami/publish-lock.yaml`.

Leave facts the later file does not cover. Drop instructions that point at an API, a column, or a script the later change removed.

## Beta lines

On `v2`, omit `replay` in a new file. Tegami adds `exit-prerelease` when it versions, and the body is what `2.0.0` will contain.

Write the durable contract:

- Schema, export, and option names as they are at the tip of the branch.
- "Create the schema on a new database" when that is the upgrade.
- "Keep every `@dimah-s3/*` package on the same version."

A sentence that is true only while the line is a beta ("this is a beta", "install the `beta` dist-tag", "stay on this beta") belongs in a file with `replay: []`, written **before** the version action. That file is deleted on the beta bump and does not enter `2.0.0`.

After a file is replay-only, edit the Markdown under the frontmatter only. Keep the `replay` list. Putting `type` back opens another version bump.

## Bump

The maintainer picks `patch`, `minor`, or `major`. Meanings and the `v2` counter are in [release.md](./release.md). The prose still marks a break when the counter does not move.

Skip a file for repo-only docs, CI, and typos that do not change published behavior or build output. A dependency bump that changes published output still gets one.

## Checklist

- [ ] Frontmatter names the package or `group:dimah-s3`, with a bump, and no hand-written `replay`
- [ ] `###` title is the outcome; the body tells a consumer what changed
- [ ] Every break is under `#### Breaking changes` with the replacement
- [ ] The body is still true in the `2.0.0` section, beside the other replay files
- [ ] An earlier replay file that described the old contract now describes the final one
- [ ] `CHANGELOG.md` and `publish-lock.yaml` were not edited
