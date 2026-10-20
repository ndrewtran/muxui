# Text usage

Use Text to apply a Mux UI typography role to text. Two choices stay separate: `as` picks the HTML element, and `variant` with `size` picks how the text looks.

## Level and look

- Choose the element from the page outline: one `h1` for the page, `h2` for its sections, and `h3` below those, without skipping a level.
- Choose the look from the role, and keep it the same for the same kind of content. Two headings at different levels can share one look.
- Do not pick a level to get a size. Change `variant` or `size` instead.

## A page hierarchy

| Content | Element | Role |
| --- | --- | --- |
| Page title | `h1` | `display`, `sm` |
| Section heading | `h2` | `heading`, `md` |
| Body text | `p` | `body`, the default |
| Label | `div` or `span` | `label`, `sm` |

The Basic React Text example uses all four, with muted body text and a `mono` value. The Typography foundation lists what each role sets, so this guide does not repeat it.

## Content

- Use `title` for the heading of a smaller unit, such as a card or dialog, and `mono` for technical values such as an address or an ID.
- Use `color="muted"` for secondary text, such as a helper line under a heading.
- Use `truncate` for a single line in a container with a limited width. It clips the text and does not wrap it.
- To name a form field, use the field's own label. For a native input, use `as="label"` with `htmlFor`, as the Text in a field example does.

## Common mistake

Choosing the heading level by size, such as `as="h4"` because the text should look small. The level places the heading in the page outline, so a skipped level misplaces it. Pick the level from the outline and set the size with `variant` and `size`.
