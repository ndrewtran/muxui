# Virtualizer usage

Use the Mux UI Virtualizer contract. The default stack layout renders its own fixed-height rows and needs an accessible name on the Virtualizer. Grid layout virtualizes a GridList, which carries the name instead.

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

Give the GridList a block size, such as `style={{ blockSize: '40rem' }}`, so it is a bounded scroller. Without a block size, the page scrolls the grid. That works, with one upstream caveat: WebKit can log a benign ResizeObserver loop warning while the container resizes.

## Page layout and breakpoints

Mux UI has no breakpoint or responsive layout API. React Aria provides no breakpoint-based page-layout styling API, and React Spectrum's responsive layout is not part of Mux UI. Page and breakpoint layout stays standard CSS, separate from this API. The Virtualizer only receives the numbers you derive, such as `maxColumns`.
