# Table usage

Use the Mux UI Table contract and provide an accessible name.

## Table or other collections

- Use Table to compare rows across columns, with sorting or selection.
- Use [GridList](/components/grid-list/) for items that are opened or selected as a whole and not compared across columns.

## Narrow screens

Table fills the width it is given and renders every column at every width. Mux UI has no breakpoint API, so the application decides what a narrow screen shows. Choose by what people do with the rows.

- To compare across columns, keep every column and put the Table in a wrapper that scrolls horizontally. Give the Table a minimum width so its columns keep their size. The Table in a scroll container example does this.
- To scan a few key facts, pass only the columns that task needs, and give people a way to reach the full row.
- When rows need no comparison, show them as a compact list, such as a [GridList](/components/grid-list/), with the details in another view.

## Sorting

Table shows sort state and reports changes, but it never sorts the rows: it renders them in the order it receives them. To sort, keep the sort in state, pass it back to the Table, and sort the rows yourself when the Table reports a change. Only columns marked sortable can be sorted, and a sort for any other column is rejected with an error.

Give every row an id that stays with its data when the rows reorder. Selection follows the id, so a row without one, whose identity falls back to its position, can end up selected under a different row after a sort. The Sortable Table example sorts people by name or role and keeps a selected row selected.

## Content

- Label each column with a short noun, such as Role.
- Mark the column that names each row as the row header with `isRowHeader`, usually the first.

## Common mistake

Expecting a sortable column to sort the rows. Table only reports the new sort, so sort the rows yourself and pass them back in that order.
