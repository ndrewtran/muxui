# RadioGroup usage

Use RadioGroup to choose exactly one option from a short, visible list. Give RadioGroup an accessible name.

## RadioGroup or an alternative

- Use [Select](/components/select/) when the list is long enough that showing every option would crowd the page.
- Use [CheckboxGroup](/components/checkbox-group/) when several options can be chosen.
- Use [ToggleButtonGroup](/components/toggle-button-group/) for modes that apply as soon as they are chosen, such as a view mode. RadioGroup is for a named choice that a form submits.

## Options or RadioField

- Pass options that are only a label as the `options` list.
- Use [RadioField](/components/radio-field/) children when an option needs supporting text, such as a description or an error.

## RadioField options

A RadioGroup takes its options either as a list or as children, never both. RadioField options go in as children. Each one needs the group as its parent, and the group supplies the selected value, the change callback, and the size. A RadioField also carries its own description and error parts. The RadioGroup with RadioField options example shows two options in a controlled group, and the RadioField page shows the error and disabled states. The [API reference](#api-reference) lists the props Mux UI defines.

## Content

- Label the group with what is being chosen, such as Density.
- Label each option with a short noun phrase, such as Compact.

## Common mistake

Expecting a group with no selection to submit a value. A named group submits only the selected option, so preselect one with `defaultValue`, or treat a missing entry as no choice.
