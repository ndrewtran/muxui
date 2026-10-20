# TagSelect usage

Use TagSelect to choose several values from predefined items, each kept visible as a tag that can be removed.

## TagSelect, MultiSelect, or InputTags

Choose by whether the chosen values themselves matter.

- Use TagSelect when people need to see each chosen value and remove them one at a time.
- Selected tags wrap onto new rows, so the field grows taller as more are chosen. TagSelect has no cap or collapse of its own.
- When many selected values would overwhelm the field, use [MultiSelect](/components/multi-select/), which shows a count such as 8 selected.
- For values that people type themselves, use [InputTags](/components/input-tags/).

The TagSelect and MultiSelect with many selected values example shows the same eight values both ways in a narrow container.

## Content

- Give each item a stable string `id`. The selection is a set of those IDs, reported through `onSelectionChange`.
- Keep labels short, so more tags fit on each row.
- Use the placeholder to say what to pick, such as Add a tag. It shows only while nothing is selected.

## Common mistake

Letting a growing selection wrap inside a form. The field keeps adding rows and pushes everything below it down. Switch to MultiSelect when the selection can get large.
