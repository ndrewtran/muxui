# DatePicker

Use the Mux UI React DatePicker binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Date and open state

The date and the open state are separate, so the application can control either one or both. The Controlled date and open state example opens the calendar from a button, clears the date, and makes weekends unavailable. The unavailable-date callback receives each date as a `YYYY-MM-DD` string. The [Behavior](#behavior) section lists what choosing and clearing a date do, and the [API reference](#api-reference) lists the props.
