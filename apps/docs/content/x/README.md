# X

Paste sources for posts on X. These files are not site routes.

The canonical page is the matching note in `../blog/{slug}.mdx`. Publish that first. The X post links to it.

Each directory name is the blog slug:

- `post.md` — the post. Paste the body under the frontmatter. Keep it under 280 characters.
- `article.html` — the X Article body. Open it, click Copy article, and paste into the body. Title and subtitle go in their own fields. X does not read Markdown or code blocks.
- `article.md` — title, subtitle, and the pointer to `article.html`. Not the paste source.
- `cover.png` — the Article image, 5:2. Upload it with the article.

Facts stay aligned with that note and the docs. Coding agents read `/llms.txt`.
