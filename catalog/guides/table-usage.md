# Table usage

Use the Mux UI Table contract and provide an accessible name.

## Sorting

Table shows sort state and reports changes, but it never sorts the rows: it renders them in the order it receives them. To sort, keep the sort in state, pass it back to the Table, and sort the rows yourself when the Table reports a change. Only columns marked sortable can be sorted, and a sort for any other column is rejected with an error.

Give every row an id that stays with its data when the rows reorder. Selection follows the id, so a row without one, whose identity falls back to its position, can end up selected under a different row after a sort. The Sortable Table example sorts people by name or role and keeps a selected row selected.
