# Calendar usage

Give Calendar a label and use Mux UI ISO `YYYY-MM-DD` values.

## Calendar, DatePicker, or DateField

Choose by where the date lives.

- Use Calendar when the month is part of the page, such as a booking or scheduling panel, and your own state applies the chosen date.
- Use [DatePicker](/components/date-picker/) for a date in a form field. It opens the same calendar from a field.
- Use [DateField](/components/date-field/) when typing the date is faster than a calendar.
- For a start and end date, use [RangeCalendar](/components/range-calendar/).

## Selection and focus

Calendar tracks a selected date and a separate focused date. Moving focus does not select, and controlling the focused date also controls the month shown. The Controlled selection and focus example controls both and moves focus from a button. A read-only calendar still moves focus but cannot select, and an unavailable date can take focus but cannot be selected.

## Content

- Label the calendar by the date it picks, such as Delivery date, as the Controlled selection and focus example does.
- Mark dates that cannot be chosen with `unavailableDateMatcher`, which receives each date as a `YYYY-MM-DD` string.

## Common mistake

Using Calendar as a form field. It is an inline selection surface that submits nothing and renders no field messages. A named date field is DatePicker or DateField. To submit a Calendar's date, send the application's own state.
