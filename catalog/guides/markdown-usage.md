# Markdown usage

Use Markdown to render authored Markdown inside a page. It keeps a bounded subset of Markdown, drops raw HTML, and removes unsafe URLs.

## Headings in a host page

Markdown renders heading depth as written, so `#` is an `h1`, `##` is an `h2`, and so on. It does not shift the levels to fit the page around it.

- Start the document at the level that fits the host page. Under an `h2` section, begin with `###`.
- Do not begin every embedded document with `#`. Several `h1` elements leave the page without one title.
- Write headings in order, without skipping a level.
- Markdown adds no heading ids, so a link to a fragment such as `#summary` needs an element with that id on the host page.

The Markdown under a host heading example nests a document below an `h1` and an `h2` that the host owns.

## What renders

- Markdown keeps headings, paragraphs, bold, italic, inline code, fenced code blocks, quotes, lists, rules, links, and images.
- Tables, task lists, strikethrough, bare URLs, and indented code stay as plain text.
- Raw HTML is dropped. A tag inside a line is removed and its text stays, while an HTML block is removed with its text.
- A fenced code block is plain text in a `pre` element. For highlighting and a copy action, use [CodeBlock](/components/code-block/).

## Links and images

- Without `baseUrl`, relative links and images show as text. Pass an absolute `baseUrl` to resolve them.
- Only `http`, `https`, and `mailto` links are kept, so a link with another scheme shows only its text.
- Set `invalidFallback` for the case where the base URL or the source is rejected.

The Markdown with relative links example resolves relative URLs against `baseUrl` and drops two unsafe ones.

## Common mistake

Starting every embedded document with `#`. Each one renders an `h1`, so a page with three notes has three page titles. Start at the level below the host's own heading, as the Basic React Markdown example does.
