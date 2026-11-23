# Product docs

Rules for `apps/docs/content/docs/`. Every page is read twice: as HTML at `/docs/<page>`, and as Markdown at `/docs/<page>.md` and in `/llms-full.txt`, which coding agents fetch. Write for both.

## Navigation

Four sidebar tabs, one root folder each. Each page lives in exactly one tab.

| Tab         | Folder                     | URL              | Holds                                                        |
| ----------- | -------------------------- | ---------------- | ------------------------------------------------------------ |
| Get Started | `(framework)/` (URL group) | `/docs/*`        | Introduction, quickstart, upgrade, providers, database, i18n |
| Server      | `server/`                  | `/docs/server/*` | `@dimah-s3/server`: setup, routes, hooks, security, plugins  |
| React       | `react/`                   | `/docs/react/*`  | `@dimah-s3/react`: setup, hooks, guides, custom backend      |
| UI          | `ui/`                      | `/docs/ui/*`     | `@dimah-s3/ui`: installation, components, theming            |

- Order pages in `meta.json`. Group with `---Label---` separators, not with extra folders.
- Moving or renaming a page changes its URL. Add a permanent redirect in `apps/docs/next.config.ts` (`movedPages`) and update every link to it in `content/`, `src/`, package READMEs, and `templates/*/README.md`.
- Link other pages with absolute paths: `/docs/server/routes#upload`.

## Voice

- Second person, present tense, active voice. "Pass `route`", not "The route can be passed".
- Open with what the thing is and when to use it, in one or two sentences. Then show code.
- One idea per paragraph. Short sentences. American English. Sentence-case headings.
- Code before prose. Every page has an example a reader can paste.
- Explain behavior the reader must know to use the API correctly. Leave internals (focus algorithms, memo rules, render counts) to the source and its JSDoc, unless a reader has to act on them.
- Edge cases go in a short list or a `<Callout>`. Rare questions go in an FAQ.
- Name exports in code font on first use, and link them to their page: [`useUpload`](/docs/react/hooks/upload).
- No "simply", "just", "easy", "powerful", or marketing adjectives.

## What to leave out

Every sentence has to earn its place. If a reader would not miss it, delete it. If only some readers need it, move it to the page where they look for it and link there.

- **Reference on a getting-started page.** Option and flag tables, every variant, and every runtime belong on a reference page. A quickstart shows one path; the CLI flags live on `/docs/cli`, all adapters on `/docs/server/setup`.
- **Prose that repeats the code.** Do not describe what the example above already shows, or restate the heading.
- **Internals the reader cannot act on.** Focus hand-off order, memoization, batch sizes, retry internals, render counts, development-only warnings.
- **Obvious defaults.** "It defaults to nothing", "other props pass through". The API table carries defaults and forwarded props.
- **The same fact on several pages.** Each fact has one home page. Elsewhere, link to it in a few words (`Mount one <Toaster />, see Installation`).
- **Parallel examples of one thing.** Show the main path (npm, Next.js). Link to the alternative instead of repeating the whole block for it.
- **Callouts for ordinary notes.** A `<Callout>` is for a security rule, data loss, or a setup mistake that breaks things. Everything else is a sentence.
- **Meta text and hedges.** "This page covers", "as described above", "note that", "for example in CI".
- **Rare edge cases in the main flow.** One bullet, an FAQ entry, or nothing.

Keep: every step the happy path needs, security and correctness rules (credentials, ownership, `onConfirmed` running at least once, CORS), the errors a reader will hit and their fix, and behavior that surprises.

Add what is missing: a runnable example, the next page a reader needs (`## Next steps` on guides), and a reference page when details have no home.

## Frontmatter

- `title`: a short noun phrase, or the export name (`useUpload`).
- `description`: one sentence, at most about 160 characters, ending with a period. It is the page subtitle, the search snippet, and the line agents read in `/llms.txt`.
- Quote a value that contains `: `. YAML reads it as a nested mapping and the whole docs build fails.
- `icon`: a [Lucide](https://lucide.dev/icons) name, on section index pages and a few landmark pages only.

## Page templates

Keep the section order. Drop a section that has nothing to say. On every page, `## API Reference` comes after the content sections, and an optional `## Frequently asked questions` (an `<Accordions>` block) comes last. Use those two heading names exactly.

### UI component (`ui/components/*.mdx`)

```mdx
---
title: Upload
description: One sentence — what it renders, and for which hook.
---

{imports}

One or two sentences: what it is and when to use it. Name the alternative when there is a close one.

<DemoPreview name="upload-demo.tsx">
  <UploadDemo />
</DemoPreview>

## Installation

<Tabs items={["npm", "shadcn"]}> — the `@dimah-s3/ui` import, and the
`npx shadcn@latest add @dimah-s3/<item>` command with the files it writes.

## Usage

Smallest working component, then at most three sentences.

## Anatomy (compound components only)

The parts nested as you would write them, then a Part | Description table.

## Examples

### {Name}

One sentence on what it shows.

<DemoPreview … />

## {Behavior sections} (only what a user must know: state, limits, toasts)

## Accessibility

Bullets: roles, names, live regions, keyboard.

## API Reference

### {Component}

One sentence. "Also accepts every `Button` prop." when props are forwarded.

| Prop | Type | Default | Description |
```

### Hook (`react/hooks/*.mdx`)

Intro, usage, concept sections, examples, then `## API Reference` with an options table and a return table, then the FAQ.

### Server / feature page

Intro, a complete code example, sections by task, then `## API Reference` when the page documents options, then the FAQ.

### Guide

A goal in the title ("Upgrade to 2.0"). Steps with `### Title [step]` (remark-steps). Each step: one action and its code. A step heading's anchor ends in `-step`: `### Mount the Toaster [step]` is `#mount-the-toaster-step`.

## API reference tables

`AutoTypeTable` and `TypeTable` are not used. Their output is not in the Markdown twin, so agents see nothing, and full generated tables make pages long. Write a Markdown table.

| Prop         | Type                   | Default    | Description                           |
| ------------ | ---------------------- | ---------- | ------------------------------------- |
| `upload`     | `UseUploadReturn`      | required   | The `useUpload` return the parts read |
| `shape`      | `"circle" \| "square"` | `"circle"` | Rounds the whole image or its corners |
| `onUploaded` | `(result) => void`     | —          | Runs once for each image that uploads |

- Columns: `Prop | Type | Default | Description` for props and options; `Property | Type | Description` for return values and context values.
- Default column: a code value, `required`, or `—`.
- Request, response, and record shapes (no defaults) use `Property | Type | Description` and mark optional fields on the name: `checksum?`. Say "Fields marked `?` are optional." above the first such table on a page.
- Types are short and readable: name the exported type (`UseUploadReturn`), write callbacks as `(result) => void`, escape unions as `\|`.
- Description is a sentence fragment: capital first letter, no trailing period.
- List what readers set. Collapse forwarded props into one line above the table ("Also accepts every `img` prop.").
- Check every row against the TypeScript type and its JSDoc in `packages/*/src` before you write it. Do not document `@internal` members.

## MDX components

Available everywhere (see `apps/docs/src/components/mdx.tsx`): `Callout`, `Cards`/`Card`, `Tabs`/`Tab`, `Accordions`/`Accordion`, `Steps`/`Step`, `Files`, `DemoPreview`, `ComponentPreview`, `Flow`, `ErrorCodeTable`, and `<include>`.

- `DemoPreview name="x.tsx"` renders `src/components/demos/x.tsx` live, and its source in the Markdown twin. Keep demos small and realistic.
- `ErrorCodeTable` is generated from `S3_ERROR_CODES` and becomes a Markdown table in the twin.
- `Flow` is drawn only in HTML; the Markdown twin drops it. Describe the same steps in prose or a table next to it.
- Code fences: `tsx`/`ts`, a `title="path"` when it is a file, `"use client"` at the top of client components. Import from `@dimah-s3/ui` in UI examples. `npm` fences render package-manager tabs.
- Install commands name the package with no dist-tag or version (`npm i @dimah-s3/react`).
- `// [!code ++]` marks added lines in setup steps only.

## Before you finish

1. `pnpm --filter docs check-types` and `pnpm --filter docs lint`.
2. Open the page in the dev server, and its `.md` twin.
3. Changed a URL: redirect added, links updated.
