# DateRangePicker

Date values are Mux UI ISO strings (`YYYY-MM-DD`). Set `startName` and `endName` for form submission; Mux UI owns paired hidden inputs and resets them with the form. The picker's calendar parts are built in and not exported.

## Range values

A range is null or a complete pair of start and end dates; an object missing either endpoint is rejected. A range whose end is before its start is kept as given and is invalid, and a range whose start and end are the same date is valid.

The unavailable-date callback receives each date and the anchor, both as `YYYY-MM-DD` strings. The anchor is the start date chosen so far, or null before a start is chosen, so a rule can depend on the start. Selection stays contiguous, so a range cannot cross an unavailable date. The Controlled range with an unavailable rule example keeps a one-day range and limits a trip to seven days from its start.

## In a form

Each endpoint is its own form entry, named by `startName` and `endName`, and each submits `YYYY-MM-DD` or an empty string while the range is empty. Server errors keyed by either endpoint name show together as one error message on the field. Editing the range, or resetting the form, dismisses those errors until the form receives a new errors object.

Resetting the form restores an uncontrolled range to its default value. A controlled range is not changed by a reset, so the application restores it in the form's reset handler. The DateRangePicker in a form example shows an error keyed by an endpoint name and a controlled reset. The [API reference](#api-reference) lists the props.
