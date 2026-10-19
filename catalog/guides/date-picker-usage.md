# DatePicker

Use the Mux UI React DatePicker binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Date and open state

The date and the open state are separate. Controlling the date leaves the calendar to open and close on its own, and controlling the open state lets the application open the calendar from elsewhere while the picker keeps its own date. Choosing a date closes the calendar. Clearing the date reports null, and a controlled null shows an empty field.

The unavailable-date callback receives each date as a `YYYY-MM-DD` string, and an unavailable date cannot be chosen in the calendar. The Controlled date and open state example controls both, opens the calendar from a button, clears the date, and makes weekends unavailable. The value is a calendar date with no time or time zone. The [Behavior](#behavior) section lists the date bounds, and the [API reference](#api-reference) lists the props.
