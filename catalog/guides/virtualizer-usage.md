# Virtualizer usage

Use the Mux UI Virtualizer contract. The default stack layout renders its own fixed-height rows and needs an accessible name on the Virtualizer. Grid layout virtualizes a GridList, which carries the name instead.

## When to virtualize

Decide from measured rendering cost, not from an item count. No count always needs a Virtualizer, and a short list is simpler without one.

- Virtualize a long list or grid that people scan continuously, once mounting every item measurably slows the page.
- Page the data instead when people work through discrete sets, such as search results. Each page stays short, so it needs no Virtualizer.
- Choose the layout by the rows. Stack suits rows of a predictable height, because it does not measure them. Grid measures each row, so cards of different heights work.

## Stack layout

The default stack layout is a list of the items you give it, in rows placed a fixed distance apart. Its rows cannot be selected, and it does not virtualize children or another collection such as a Table or Tree; use grid layout for a GridList. Height and row height are in pixels and overscan counts whole rows, and the Behavior section lists the valid values.

Rows are not measured, so keep each row's content within the row height: taller content overflows into the next row. The Virtualizer sets its own block size and scrolls inside it, which replaces any block size or overflow in its style. Only the visible rows, the overscan rows, and the focused row are in the page at once, so more rows than that are mounted when focus has moved away from the visible window. The Virtualizer with taller rows example fits a two-line label inside a larger row height.

## Grid composition

Wrap one `<GridList layout="grid">` in `<Virtualizer layout="grid">`. The Virtualizer renders no element of its own, so the two split the work:

| Owner | Responsibilities |
| --- | --- |
| GridList | Accessible name, selection, keyboard and nested-control behavior, scroll region block size, and the CSS `gap`. |
| Virtualizer | Column count from `minItemWidth`, `maxItemWidth`, and `maxColumns`, item positions, row measuring, and `overscan`. |

The GridList's `gap` separates items and also insets the first and last rows and columns from its edges, so give the GridList no padding. The Virtualizer binding behavior lists the defaults and the column formula.

## CSS grid versus virtualized positioning

Without a Virtualizer, CSS places a GridList's items: set `grid-template-columns` and change it with `@container` or `@media`. Inside a Virtualizer that has no effect. The Virtualizer positions every item itself, so track properties do not place virtualized items. The CSS `gap` is the exception: the Virtualizer reads its resolved pixel value as spacing, so set `column-gap` and `row-gap` with an inline style or in a class loaded after the Mux UI stylesheet to change it.

## Exact column counts

`maxColumns` is a cap, not an exact count: a container too narrow for that many columns shows fewer. To get a chosen count in each container-width tier, drive `maxColumns` from the container's width and choose `minItemWidth` per tier with headroom, so even the narrowest container in the tier reaches the cap after a classic scrollbar takes its share.

Break on the container's width, not the viewport, so a grid in a sidebar layout, a docs frame, or a split view responds to the space it gets. A viewport `matchMedia` works the same way when the grid always spans the page. Measure the container with a callback ref on a wrapper element and a `ResizeObserver`, then map its width to `maxColumns`. Give the wrapper a width of its own, because the grid measures it. Start from a fixed count in state, so server rendering and hydration agree and no render reads `window`. Convert `rem` with the root font size, as container queries do.

## Measured rows

Rows measure their content, and every card in a row takes the tallest height. Never put an aspect ratio on a whole card: it clips titles and actions that wrap. Put any ratio on the media inside the card, as the GridList usage guide describes.

`estimatedItemHeight` is a plain estimate for rows that have not mounted yet. Set it near the typical card height so the scrollbar is about right before anyone scrolls. A card that shrinks without a width or item change keeps its old row height until the next width or item change.

## Scrolling

Give the GridList a block size, such as `style={{ blockSize: '40rem' }}`, so it is a bounded scroller. Without a block size, the page scrolls the grid. That works, with one caveat: WebKit can log a benign ResizeObserver loop warning while the container resizes.

## Page layout and breakpoints

Mux UI has no breakpoint or responsive layout API. React Aria provides no breakpoint-based page-layout styling API, and React Spectrum's responsive layout is not part of Mux UI. Page and breakpoint layout stays standard CSS, separate from this API. The Virtualizer only receives the numbers you derive, such as `maxColumns`.

## Content

- Keep each stack row's content to the lines that fit the row height, such as a title and one line of detail.
- Give every item a stable string `id`.

## Common mistake

Putting content taller than `itemHeight` in a stack row. Rows are not measured, so the content overflows into the next row. Raise `itemHeight` to fit the content, as the Virtualizer with taller rows example does.
