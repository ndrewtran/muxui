# DataDiff usage

Use DataDiff to review proposed changes to a small table and choose which to request. The application supplies each row already marked as added, removed, updated, or unchanged, and DataDiff computes no diff.

## DataDiff or another family

- Use DataDiff to review and select proposed row changes before an explicit Apply.
- Use [CodeBlock](/components/code-block/) to review changed lines of code.
- Use [Table](/components/table/) for rows that have no proposed changes.

## Rows and selection

- Give each row a stable, unique `id` and a `label` that names it, such as the token's name.
- Give added, removed, and unchanged rows `values`, and updated rows `before` and `after`. Each record has exactly the declared column ids.
- Values are text, finite numbers, booleans, or `null`. Keep `0`, `false`, and `null` explicit, because DataDiff shows them.
- Unchanged and disabled rows cannot be selected. By default every enabled change starts selected, and rows supplied later are not selected automatically.

The Basic React DataDiff example proposes additions and removals. The Controlled React DataDiff example controls the selection of updates.

## Applying

- Apply reports the selected row ids in row order, and does nothing more. It writes nothing, does not change the rows, and does not clear the selection.
- Make the request in `onApply`, set `pending` while it runs, and pass the updated rows when it finishes.
- Apply is disabled when no change is selected or `onApply` is missing.

## Content

- Make `label` a visible heading that says what is under review, such as Proposed token cleanup.
- Use `description` to say what Apply will do. The default is Select changes to apply.
- Keep column labels short. Long values wrap inside their cells.
- `applyLabel` replaces the whole button label, which is otherwise Apply with the count of selected changes.

## Common mistake

Expecting Apply to change the rows. DataDiff only reports the selected ids, so apply the changes in your own code and then pass the updated rows, or the same changes stay on screen as proposals.
