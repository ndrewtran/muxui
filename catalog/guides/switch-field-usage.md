# SwitchField usage

Use SwitchField for a setting that is on or off, composed from the Root, Button, Thumb, Description, and Error parts. [Switch](/components/switch/) takes the same label, description, and error text as props.

## Saving a setting

- A standalone SwitchField applies its setting as soon as it is toggled, so save in the change handler and add no Save Button.
- A SwitchField inside a staged form takes effect when the form is saved, and the setting stays as it was until then.

The SwitchField in a form example shows the staged case.

## Label and description

- Name the setting with a noun or a short phrase, such as Notifications, and keep the label the same whether the setting is on or off.
- Put the effect in the description, such as Send product updates by email.
- Use an affirmative statement, such as Share my location, only when the noun alone leaves unclear what on means.

## Common mistake

Labelling the switch with an action, such as Enable notifications. The label then describes a change, not the setting, so it says nothing about the setting while the switch is off. Name the setting and put the effect in the description.
