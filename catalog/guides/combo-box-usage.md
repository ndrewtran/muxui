# ComboBox usage

Use normalized item records and provide a label for filtered options.

## ComboBox or Autocomplete

Choose by what the form should receive.

- Use ComboBox when the user must choose a known record. A named ComboBox submits the selected item's `id`, or an empty value when nothing is selected.
- Use [Autocomplete](/components/autocomplete/) when typed text is a valid value, such as a place missing from the suggestions. It submits the suggestion's `value`, or the text as typed.
- For a short list that needs no filtering, use [Select](/components/select/). For several options, use [MultiSelect](/components/multi-select/).

The ComboBox and Autocomplete submitted values example puts both over the same records, whose labels, IDs, and values all differ, and shows what each one submits.

## Text and selection

A ComboBox keeps the input text and the selected option as separate state. The option is identified by its ID, so give each item a stable ID and keep the ID, not the label, as the selection. If you control both, the application sets the text when an option is chosen. Emptying the input calls `onSelect` with no item, so set the selected ID to `null` and the text to an empty string there. Pass `selectedId={null}` for a controlled field with no selection; an empty string is not an ID and throws. The Controlled text and selection example wires both. The [Behavior](#behavior) section lists the callbacks, and a named form submits the selected ID, or an empty value when nothing is selected.

## Content

- Label the field with the record it picks, such as Depot or Customer, not Search.
- Make each item's label the text people type to find it. The filter matches that text anywhere in it, ignoring case and accents.
- Pass every option, not a list filtered in advance, because the ComboBox filters as the user types.

## Common mistake

Expecting the text people type to be submitted. A named ComboBox submits only an option's `id`, and text that matches no option is never submitted. When typed text must count, use Autocomplete.
