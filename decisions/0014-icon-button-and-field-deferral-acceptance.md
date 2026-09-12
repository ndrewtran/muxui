# Decision 0014 accepted direction

On 12 September 2026, Andrew instructed Codex:

> Add the IconButton to Mux UI and defer Field.

This followed a comparison showing that AlertDialog, ButtonGroup, and
MultiSelect already have dedicated Mux families, while IconButton and Field do
not. The recommendation was to add IconButton by reusing Button and requiring
an accessible name, and defer Field pending a concrete custom-control need.

The instruction authorizes this bounded component and scope change. It does not
claim that tests or reviews passed, that the PR merged, or that any package was
published. Repository adoption still follows the protected pull-request path.
