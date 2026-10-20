# Card usage

Use Card to group related content, metadata, and actions on one surface. `Card.Root` is a static container, and `Card.Button` makes the whole card one control.

## Choosing a surface

The `variant` sets the surface only. Choose it by the card's place in the page hierarchy.

- `outlined`, the default, is for ordinary boundaries, such as a profile or a settings group.
- `filled` is for low-emphasis grouping, such as a note or summary beside the main content.
- `elevated` is for a card that needs to lift off its surroundings, such as one featured card. Avoid it in repeated content, where the shadows add up.
- The surface does not decide whether a card is interactive. Use `Card.Button` for a clickable card, with any variant.

The Card surfaces example shows the three side by side.

## Static or interactive

- Use `Card.Root` for content, and put buttons and links inside it as needed.
- Use `Card.Button` when the whole card is one choice, such as a plan. Track its `selected` state in the application.
- To navigate from a card, put a [Link](/components/link/) inside `Card.Root`. `Card.Button` is a button, not a link.

## Content

- `Card.Header`, `Card.Body`, and `Card.Footer` are plain divs, not headings. Put your own heading element in the header when the card titles a section.
- Put the card's actions in the footer, and give one the main emphasis as in [Button](/components/button/).
- `padding` is `sm`, `md`, or `lg`. Use one value across cards that sit together.

## Common mistake

Putting a Button or Link inside `Card.Button`. A native button cannot contain interactive elements, so use `Card.Root` for a card with its own actions, or make the whole card one `Card.Button`.
