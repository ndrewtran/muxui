# TimeField

Use the Mux UI React TimeField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Values and forms

A time is a local clock time as `HH:mm`, with no date, time zone, or offset. A value with seconds, such as `09:30:45` from a database column, is accepted and its seconds are ignored: the field shows, emits, and submits `HH:mm`. Any other string is rejected. A cleared field reports null, and a controlled field shows null as empty.

Give the field a name to submit it: the form receives `HH:mm`, or an empty string while the field is empty. Resetting the form restores an uncontrolled field to its default value, while a controlled field keeps its value until the application changes it. The TimeField in a form example shows a time with seconds, clears it to null, and reads the submitted value.

Bounds are compared at minute precision, and the minimum cannot be later than the maximum, so a window that crosses midnight cannot be written as bounds. Any time zone or overnight rule is the application's.
