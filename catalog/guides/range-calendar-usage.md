# RangeCalendar usage

Use the Mux UI RangeCalendar contract and provide an accessible name.

## RangeCalendar, DateRangePicker, or Calendar

Choose by where the range lives.

- Use RangeCalendar when the months are part of the page, such as a booking panel, and your own state applies the chosen range.
- Use [DateRangePicker](/components/date-range-picker/) for a range in a form field. It owns the start and end names and the field messages.
- For one date, use [Calendar](/components/calendar/).

## Content

- Label the calendar by the range it picks, such as Stay or Trip dates.
- Mark dates that cannot be chosen with `unavailableDateMatcher`.

## Common mistake

Using RangeCalendar as a form field. It is an inline selection surface for a start and end date. It renders no form input, description, or error message, so it submits nothing, and the required and invalid states do not make it a submitting field. To submit a RangeCalendar's range, send the application's own state.
