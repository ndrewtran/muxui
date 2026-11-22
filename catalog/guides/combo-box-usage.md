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

## Groups of options

- Pass `sections` in place of `items` to show the options under named headers, such as Recent and All teams. Each header is exposed to assistive technology as the name of its group.
- Typing filters every section, and a section with no match is hidden. The arrow keys move through the options of every section as one list; the headers are not stops.
- Keep item IDs unique across sections. The Options in named sections example groups teams this way.

## When the items change

- A selection outlives the items that held it. When a new search leaves the selected option out, the field keeps its ID, the form still submits it, and `onSelect` does not report it cleared.
- If you control both the text and the selection, Escape and leaving the field after typing call `onSelect` with the selected item, so set the text to its label there, as you do when an option is chosen.
- If the field holds its own text, reverting it shows no text for a selection the items no longer hold, though the selection stays. Control the text as well when the items can change under a selection.

## Content

- Label the field with the record it picks, such as Depot or Customer, not Search.
- Make each item's label the text people type to find it. The filter matches that text anywhere in it, ignoring case and accents.
- Pass every option, not a list filtered in advance, because the ComboBox filters as the user types.

## Common mistake

Expecting the text people type to be submitted. A named ComboBox submits only an option's `id`, and text that matches no option is never submitted. When typed text must count, use Autocomplete.
