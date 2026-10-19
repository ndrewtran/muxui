# Calendar usage

Give Calendar a label and use Mux UI ISO `YYYY-MM-DD` values.

## Selection and focus

Calendar tracks a selected date and a separate focused date. Moving focus does not select, and controlling the focused date also controls the month shown. The Controlled selection and focus example controls both and moves focus from a button. A read-only calendar still moves focus but cannot select, and an unavailable date can take focus but cannot be selected.

## Not a form field

Calendar is an inline selection surface that submits nothing and renders no field messages. A named date field is DatePicker or DateField. To submit a Calendar's date, send the application's own state.
