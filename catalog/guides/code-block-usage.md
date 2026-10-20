# CodeBlock usage

Use CodeBlock to present a code listing or a before and after change. It highlights the code, can show line numbers and a filename, and copies the exact text.

## Code or diff

- Use code mode, the default, for a listing. Pass the text as `source`.
- Use `mode="diff"` to review a change. Pass the two complete versions as `before` and `after`, and CodeBlock works out the changed lines itself.
- A diff is a line diff. It shows no changes within a line and applies nothing.
- To review changes to table rows instead of lines of code, use [DataDiff](/components/data-diff/).

The Diff React CodeBlock example compares two versions of one file.

## Content

- Set `language` to highlight the code. With no language, or one it does not know, the code stays plain.
- Set `filename` when the listing is a file. Without one, the header shows the language.
- Line numbers are on by default. Set `lineNumbers={false}` for a short snippet that no one will refer to by line.
- Long lines scroll sideways by default. Set `wrap` to wrap them without changing the text.
- Copy takes the exact `source`, or the `after` text of a diff, without line numbers or change markers.
- A listing over 500 lines shows without highlighting, and one over 10,000 lines or 1,000,000 characters throws an error.

## Common mistake

Passing a patch, with lines that start with `+` and `-`, as `source`. Code mode shows those characters as plain text and copies them. Give `mode="diff"` the two complete versions in `before` and `after` instead.
