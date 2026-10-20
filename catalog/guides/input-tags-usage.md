# InputTags usage

Give InputTags a label or an accessible name. The committed tags are its value, and the text being typed is a separate draft that joins the value only when Enter adds it.

## InputTags, TokenField, or TagSelect

Choose by whether the tags need rules and where they come from.

- Use InputTags for typed tags that need rules and should show as removable chips.
- Use [TokenField](/components/token-field/) for plain text tokens edited in place, with no rules.
- Use [TagSelect](/components/tag-select/) to pick tags from predefined items.

## Inline or below

`tagPlacement` sets where the chips sit.

- `inline`, the default, puts the chips and the input in one field. The field wraps and grows taller as tags fill each row, so it suits a few short tags.
- `below` keeps the input on one row and wraps the chips on a row under it. It suits long or numerous tags and an input row that stays put.
- Decide by the length of the tags against the width of the field, not by a tag count. The InputTags placement with long tags example sets both in a narrow container.

## Adding and rejecting tags

A rejected draft stays in the input, no callback is called, and no message appears, so the application shows any message through the invalid state and the error message. The validator receives the trimmed draft and returns whether to accept it. The Tag validation example rejects a malformed tag and shows a count against the limit. The [Behavior](#behavior) section lists what is rejected, in what order, and which callbacks an added or removed tag calls.

## In a form

InputTags submits nothing with a surrounding form: the tags have no form input, and the draft input has no name. Keep the tags in controlled state and send them when the form submits. Required adds an asterisk and marks the field required, but it does not check the list, so the application does. The InputTags in a form example submits the tags and checks that the list is not empty. The [API reference](#api-reference) lists the props.

## Content

- Label the field with the plural noun for the tags, such as Topics.
- Use the placeholder to say what to type, such as Add a topic. Inline shows it only while there are no tags, and below always shows it.
- Say the rule or the limit in the description, as the Tag validation example does with a count.

## Common mistake

Choosing the placement by tag count. Three long tags crowd an inline field more than ten short ones, so compare the length of the tags with the width of the field.
