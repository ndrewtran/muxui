# ListBox usage

Use the Mux UI ListBox contract and provide an accessible name.

## ListBox or RadioGroup

Choose by the options and by whether the choice is a form field.

- Use ListBox when the options are rich, such as a title with a description, when the list is long enough to scroll, or when more than one option can be selected.
- Use [RadioGroup](/components/radio-group/) for a short set of one choice that the user should scan together. It is a form field that submits its value, which ListBox is not.
- For a compact trigger and popup, use [Select](/components/select/).

The Rich scrollable ListBox with multiple selection example shows titled options that scroll and can be selected together.

## One choice from a short list

Compare the same single choice in both. Three short options, Compact, Comfortable, and Spacious, suit a RadioGroup.

- A RadioGroup always keeps one option once the user has chosen. Clicking the chosen option again changes nothing.
- A ListBox with one selection lets the user click the selected option to clear it, so the selection can end up empty. Handle an empty selection, or use RadioGroup.
- Choose a ListBox for that same choice only when the options carry a detail line or the list is long enough to scroll, such as a list of templates.

The ListBox or RadioGroup for one choice example shows the three options as a RadioGroup and as a ListBox, then a scrolling list of templates where a ListBox fits.

## Items or children

ListBox takes its options from one source. Pass data as items for a plain list, or compose Section, Header, and Item as children when options need sections or custom content. If both are supplied, the children take precedence and the items are not rendered, so move every option into the source you choose. The Basic and Grid React ListBox examples show one source each.

## Content

- Give every item a stable string `id`.
- Start each rich option with a short title that people can scan, and put the detail on a second line.
- Set `textValue` to the title on an item with custom content, as the rich example does.

## Common mistake

Using ListBox as a form field. It has no `name` prop and submits nothing, so read the selected IDs in `onSelectionChange` and send them yourself, or use RadioGroup for a single choice.
