# ListBox usage

Use the Mux UI ListBox contract and provide an accessible name.

## Items or children

ListBox takes its options from one source. Pass data as items for a plain list, or compose Section, Header, and Item as children when options need sections or custom content. If both are supplied, the children take precedence and the items are not rendered, so move every option into the source you choose. The Basic and Grid React ListBox examples show one source each.
