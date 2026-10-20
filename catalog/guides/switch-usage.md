# Switch

Use Switch for a setting that is on or off. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Switch or Checkbox

Use Switch to apply a setting, such as Notifications. Use [Checkbox](/components/checkbox/) to select an option, such as an item in a list or a term to accept.

## Saving a setting

- A standalone Switch applies its setting as soon as it is toggled, so save in the change handler and add no Save Button.
- A Switch inside a staged form takes effect when the form is saved, and the setting stays as it was until then.

The Switch that saves on change example shows the first. The SwitchField in a form example, on the [SwitchField](/components/switch-field/) page, shows the second.

## Naming

A Switch needs a label, an `aria-label`, or an `aria-labelledby`, and it throws a TypeError without one. Children do not count as a name: they render as the visible text only when no label is given, so a Switch written like a Checkbox, with only children, fails. The Switch with children and an aria-label example names the Switch with `aria-label` and uses children for its visible text. The [API reference](#api-reference) lists the props Mux UI defines.

## Label and description

- Name the setting with a noun or a short phrase, such as Notifications, and keep the label the same whether the setting is on or off.
- Put the effect in the description, such as Send product updates by email.
- Use an affirmative statement, such as Share my location, only when the noun alone leaves unclear what on means.

## Common mistake

Mixing the two contexts in one form. A Switch that saves on its own, placed among fields that wait for Save, looks like the others, so a user cannot tell whether it has already changed. Keep immediate Switches on a settings surface of their own, and put staged ones in the form.
