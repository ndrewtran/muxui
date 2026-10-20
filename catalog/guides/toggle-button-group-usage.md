# ToggleButtonGroup usage

Use the Mux UI ToggleButtonGroup contract and provide an accessible name.

## ToggleButtonGroup or RadioGroup

- Use ToggleButtonGroup for modes or options that apply as soon as they are chosen, such as text alignment or a view mode in an editor.
- Use [RadioGroup](/components/radio-group/) for a named choice in a form. ToggleButtonGroup has no `name`, so it adds nothing to the form's data.
- Use a single [ToggleButton](/components/toggle-button/) for one independent option, such as Bold.

## Single or multiple

- Keep the default single selection for modes that exclude each other, such as left, center, and right alignment. Add `disallowEmptySelection` so one mode always stays selected.
- Use multiple selection for independent options, such as bold, italic, and underline.

## Selection

Give each ToggleButton in the group a stable id. The group's selection is a list of those ids, passed as an array of strings, and its change callback reports the same kind of array. A single-selection group holds at most one id, and a multiple-selection group holds any number. Unlike the selection of other collections, it does not accept an all selection, and a selection mode other than single or multiple is rejected with an error. The Basic and Multiple selection ToggleButtonGroup examples show one array shape each.

## Content

- Label each button with a short word for its mode, such as Left, and name the group for the set, such as Text alignment.

## Common mistake

Putting a ToggleButtonGroup in a form and expecting it to submit its selection. It has no `name` and adds nothing to the form's data, so read its selection from state, or use a RadioGroup for the choice.
