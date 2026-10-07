# GridList usage

Use the Mux UI GridList contract and provide an accessible name.

## Stack or grid

The default `layout="stack"` is a vertical list of single-line rows, built from the `items` array. Set `layout="grid"` for card-like items that flow into columns, and compose each card with `GridList.Item` children instead of `items`.

## Composing cards

Give each `GridList.Item` a stable string `id` and a `textValue`. Set `textValue` to the visible title: it names the row and drives typeahead, which rich children cannot supply reliably. Style a card with `className` or `style` on the item and ordinary CSS.

## Nested controls

Put secondary actions in the card as links and buttons. They run on their own and never change the card's selection. In a grid, Tab reaches a card's nested controls and arrows move between cards. In the default vertical stack, Left and Right arrows reach them instead.

## Disabled items

Disable a card with `disabled` on its `GridList.Item`. A nested `Button` follows its item, but a nested `Link` does not, so pass `disabled` to the `Link` too. The GridList behavior notes explain why.

## Responsive columns

Mux UI has no breakpoint tokens, so responsive columns are ordinary CSS. A plain class you pass to the GridList sets `grid-template-columns`, and `@container` or `@media` rules change it per tier. The GridList behavior notes explain why your class wins over the default column tracks.

Prefer `@container`, so a grid in a sidebar layout, a docs frame, or a split view responds to the space it actually gets. Wrap the GridList in an element with `container-type: inline-size`, and give that wrapper an inline size, because a size container takes no width from its content. A viewport `@media` query works the same way when the grid always spans the page.

Spacing between cards is the GridList's CSS `gap`. To change it, set `gap` with an inline style or in a class loaded after the Mux UI stylesheet.

## Aspect ratio

Put any aspect ratio on the media inside the item, such as an `Image`: its `width` and `height` attributes set the ratio, and `inline-size: 100%` makes it fill the card. Never give the item an aspect ratio, a fixed block size, or `overflow: hidden`. The card then grows to fit a title that wraps to several lines and actions that wrap below it, cards in a row share the tallest height, and nothing is clipped.

## When to virtualize

GridList mounts every item. Wrap a grid of hundreds of cards in a Virtualizer, which mounts only the visible rows; see the Virtualizer usage guide.
