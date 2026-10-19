# Calendar usage

Give Calendar a label and use Mux UI ISO `YYYY-MM-DD` values.

## Selection and focus

Calendar tracks two dates. The selected date is the value. The focused date is the one the grid shows and the keyboard moves through. Moving focus, with the arrow keys or the month buttons, does not select; pressing Enter on the focused date, or clicking a date, selects it. Controlling the focused date also controls which month is shown. The Controlled selection and focus example controls both dates and moves focus from a button.

A read-only calendar still moves focus but cannot select, and an unavailable date can take focus but cannot be selected.

## Not a form field

Calendar is an inline selection surface. It renders no form input, description, or error message, so it submits nothing. A named date field is DatePicker or DateField. To submit a Calendar's date, send the application's own state.
