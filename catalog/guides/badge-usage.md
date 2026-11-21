# Badge usage

Use Badge to mark an item with a short role, flag or count, such as Moderator, Locked or 12. A badge is read, never pressed: it has no role and takes no focus.

## Choosing a tone

- Write what the badge means in its text. The tone supports the words and never replaces them, since colour alone is lost to some readers and under forced colours.
- Use `neutral` for roles and ordinary flags, `brand` for what the product wants noticed, and `success`, `warning` and `error` for a state of that kind.
- Use `soft` for most badges and `solid` for the one mark that must stand out, such as an unread count.

## Content

- Keep the text to a word or two, or a number. A badge stays on one line and cuts off what does not fit.
- When the visible text is not enough on its own, such as a bare number, give a `label` with the words to read in its place, such as 12 unread.
- An icon is decorative and is not read, so a badge with only an icon needs a `label`.
- For labels the user selects or removes, use [TagGroup](/components/tag-group/).

## Counts on links

- Put a count badge inside the link it belongs to and give it a `label`: the link is then read with the count, such as Inbox 12 unread, and the badge itself stays passive.
- When the count is capped on screen, such as 99+, put the exact number in the `label`.
- When there is nothing to count, leave the badge out rather than showing 0, and keep the link's own name.

The Badge count on a link example shows an Inbox link with its unread count. The Basic React Badge example shows each tone.

## Common mistake

Making a badge the only way to act on what it marks, or wrapping it in its own button. A badge is passive; put the action on a [Button](/components/button/) or a link beside it.
