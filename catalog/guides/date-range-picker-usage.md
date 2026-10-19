# DateRangePicker

Date values are Mux UI ISO strings (`YYYY-MM-DD`). Set `startName` and `endName` for form submission; Mux UI owns paired hidden inputs and resets them with the form. The picker's calendar parts are built in and not exported.

## Range values

A range is null or a complete pair of start and end dates, and a one-day range is valid. The unavailable-date callback also receives the anchor, which is the start date chosen so far, so a rule can depend on the start. The Controlled range with an unavailable rule example limits a trip to seven days from its start. The [Behavior](#behavior) section lists the shape, ordering, and contiguity rules.

## In a form

Each endpoint is its own form entry, and server errors keyed by either endpoint name show as one error message on the field. A controlled range is not changed by a reset, so the application restores it in the form's reset handler, while an uncontrolled range returns to its default. The DateRangePicker in a form example shows an endpoint-keyed error and a controlled reset. The [Behavior](#behavior) section lists when errors are dismissed, and the [API reference](#api-reference) lists the props.
