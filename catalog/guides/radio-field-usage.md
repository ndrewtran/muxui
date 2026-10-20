# RadioField usage

Use RadioField for an option that needs supporting content, composed from the Root, Button, Indicator, Dot, Description, and Error parts inside a [RadioGroup](/components/radio-group/). The group supplies the selected value, the change callback, and the size.

## RadioField or group options

- Use RadioField when an option needs a description or an error beside its label, such as a plan with its billing period.
- Keep options that are only a label in the RadioGroup `options` list.

## Group-wide requirement

- RadioGroup has no error or description part of its own. A requirement on the whole group shows its message in the Error of each option, as the RadioField options example does.
- Leave the Error off an option that cannot be chosen, such as the disabled Invoice option.

## Content

- Label each option with a short noun phrase, such as Monthly, and put the detail in the description, such as Billed every month.
- Word the error as the step to take, such as Choose a plan to continue.

## Common mistake

Setting `invalid` on one RadioField for a requirement on the whole group. Only that option is marked invalid, so set `invalid` on the RadioGroup, which marks every option.
