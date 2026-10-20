# CheckboxGroup

Use CheckboxGroup for several related options chosen together. Give the group a Mux UI accessible name and set `name` when submitting a form. Mux UI applies that name to each child checkbox, so checked values arrive as repeated entries under one FormData key.

## CheckboxGroup or Checkbox

- Use CheckboxGroup when the options share a label and a form name, such as the ways to be notified.
- Use a lone [Checkbox](/components/checkbox/) for one yes-or-no option, and [RadioGroup](/components/radio-group/) when exactly one option can be chosen.

## Vertical or horizontal

- Use the default vertical layout in general. Each option gets its own row, which keeps a list of options easy to scan.
- Use `orientation="horizontal"` only for a few short options, such as Email and SMS.
- A group never wraps its options, and each label stays on one line.
- In a container narrower than its options, a horizontal group runs past the edge, as the CheckboxGroup in a narrow container example shows.

## Content

- Label the group with what the options are, such as Notify me by.
- Keep each option to a word or a short phrase, such as Email.

## Common mistake

Reading the group's value with `FormData.get`. It returns only the first checked value, so read every checked value with `FormData.getAll`.
