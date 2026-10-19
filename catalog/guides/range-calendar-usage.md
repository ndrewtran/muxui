# RangeCalendar usage

Use the Mux UI RangeCalendar contract and provide an accessible name.

## Not a form field

RangeCalendar is an inline selection surface for a start and end date. It renders no form input, description, or error message, so it submits nothing, and the required and invalid states do not make it a submitting field. A named range field is DateRangePicker, which owns the start and end names and the field messages. To submit a RangeCalendar's range, send the application's own state.

Calendar, for a single date, has the same boundary.
