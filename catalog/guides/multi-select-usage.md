# MultiSelect usage

Give MultiSelect a label or an accessible name. Items have serializable IDs, and the selection is a set of those IDs, or all of them.

## Search, bulk controls, and the summary

Choose the affordances by the task. There is no item count at which one becomes necessary.

- Keep search for a collection that people cannot scan at a glance. Turn it off with `showSearch={false}` for a short one.
- Keep the Reset and Select all footer when people often clear or take everything. Turn it off with `showFooter={false}` when they do not.
- The trigger shows a count such as 3 selected. Keep it when the count is enough, and reword it with `selectedCountFormatter`.
- Use [TagSelect](/components/tag-select/) when people need to see or remove the chosen values themselves.
- For a short list that can stay visible, use [CheckboxGroup](/components/checkbox-group/).

The TagSelect and MultiSelect with many selected values example, on the [TagSelect](/components/tag-select/) page, shows the count beside the same values as tags.

## In a form

MultiSelect is not a native select. It renders no form input, so the application serializes the selected IDs when the form submits, expanding the all selection to the IDs of the items that are not disabled first. Required adds an asterisk and the hidden text Required to the trigger's description, but does not check the selection. The Reset and Select all buttons change the selection themselves and report it through onSelectionChange, so a controlled selection changes only when the application applies the reported selection; onReset and onSelectAll are optional notifications. The MultiSelect in a form example serializes the selection and checks it on submit. The [Behavior](#behavior) section also lists what Escape does and which text is fixed English, and the [API reference](#api-reference) lists the props.

## Content

- Label the field with the plural noun for the choices, such as Technologies.
- Use the placeholder for the empty state. It shows until something is selected, and defaults to Select.

## Common mistake

Using the count when people need to review their choices. "5 selected" does not say which five, so use TagSelect when the values themselves matter.
