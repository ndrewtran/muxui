# Separator usage

Use Separator for visually or semantically separating content. Keep its Mux UI-owned props and accessible name semantics intact.

## Separator or Resizable

- Use Separator for a fixed line between content.
- Use [Resizable](/components/resizable/) when people drag the boundary between panels.

## Vertical separators

A vertical Separator is a thin line that takes the height of its parent. Place it in a flex or grid row that has content or an explicit height. In a block parent, or in a row with nothing else in it, it has no height. The Vertical Separator example places one between two items in a flex row.

## Content

- Place a Separator between groups that differ, such as two sets of links, not between every item.
- A horizontal Separator is an `hr`, which keeps the browser's default block margins, so account for them or override them with a class when you space the layout.

## Common mistake

Using a Separator to add space or to decorate. It marks a boundary, so use it where content really changes, and use the layout's gap for spacing.
