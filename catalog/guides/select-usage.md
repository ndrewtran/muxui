# Select usage

Use the Mux UI Select contract and provide an accessible name.

## Select, SelectNative, or ComboBox

Choose by what the field needs, starting with native form behavior against rich content.

| The field needs | Use |
| --- | --- |
| Native select behavior: native options and groups, several values, visible rows, or form reset | [SelectNative](/components/select-native/) |
| Rich content in the options or the trigger, or a styled popup list | Select |
| Filtering a long list as the user types | [ComboBox](/components/combo-box/) |

## Content

- Give every item a stable string `id`.
- Set `textValue` on an item whose content is more than plain text, as the Compound React Select example does.

## Common mistake

Expecting a named Select to submit `item.value`. It submits the selected item's id, so make the id the value the server expects.
