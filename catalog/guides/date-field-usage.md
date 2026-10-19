# DateField

Use the Mux UI React DateField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Values and forms

A date is a `YYYY-MM-DD` string, whatever order the segments show for the user's locale, with no time or time zone. Date objects, timestamps, and values with a time or offset are not accepted. A cleared field reports null, and a named field submits `YYYY-MM-DD` or an empty string. The DateField in a form example supplies a date, clears it to null, and reads the submitted value. The [API reference](#api-reference) lists the props.
