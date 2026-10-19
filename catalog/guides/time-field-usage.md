# TimeField

Use the Mux UI React TimeField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Values and forms

A time is a local `HH:mm` clock time with no date, time zone, or offset. A value with seconds, such as `09:30:45` from a database column, is accepted and shown, emitted, and submitted as `HH:mm`. A cleared field reports null, and a named field submits `HH:mm` or an empty string. The TimeField in a form example shows a time with seconds, clears it to null, and reads the submitted value.

Bounds are compared at minute precision, and the minimum cannot be later than the maximum, so a window that crosses midnight cannot be written as bounds. Any time zone or overnight rule is the application's. The [Behavior](#behavior) section also lists how a reset treats a controlled and an uncontrolled field.
