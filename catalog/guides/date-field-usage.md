# DateField

Use the Mux UI React DateField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Values and forms

A date is a string in `YYYY-MM-DD` form, whatever order the segments show for the user's locale. Date objects, timestamps, and values with a time or offset are not accepted. The value is a calendar date only, with no time or time zone.

A cleared field reports null, and a controlled field shows null as empty. Give the field a name to submit it: the form receives `YYYY-MM-DD`, or an empty string while the field is empty. The DateField in a form example supplies a date, clears it to null, and reads the submitted value from the form data. The [Behavior](#behavior) section lists the date bounds and the unavailable-date callback, and the [API reference](#api-reference) lists the props.
