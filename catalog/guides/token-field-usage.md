# TokenField usage

Use the Mux UI TokenField contract and provide an accessible name.

A token is a plain string. TokenField keeps no id, metadata, or suggestions behind a token.

## TokenField, InputTags, or TagSelect

Choose by how the tokens are made.

- Use TokenField to type plain text tokens in place, where Enter turns the typed text into a token.
- Use [InputTags](/components/input-tags/) when typed tags need rules, such as no duplicates, a limit, or a validator, and should show as removable chips.
- Use [TagSelect](/components/tag-select/) when the tags come from predefined items that have ids.

## In a form

Give TokenField a name to submit it. Each token is its own entry under that name, so read them with `FormData.getAll`; `FormData.get` returns only the first. The TokenField in a form example submits the tokens and resets them. The [Behavior](#behavior) section lists what an empty, disabled, or read-only field submits and what a reset restores.

## Content

- Label the field with what the tokens are, such as Keywords.
- Say that Enter adds a token, for example in a placeholder. A comma does not split one.
- Enter trims the text, ignores a blank one, and keeps duplicates.

## Common mistake

Encoding an id in the token text, such as `user:42`, to stand for a mention or a record. A token is only its string, so the field cannot look the record up or show its name. Choose records from predefined items with TagSelect, whose selection is a set of ids.
