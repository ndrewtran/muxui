# TimeField

Use the Mux UI React TimeField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## TimeField or a date control

A time is a clock time with no date, so choose by what the value stands for.

- Use TimeField for a time of day that repeats, such as an opening time or a daily reminder.
- Use [DatePicker](/components/date-picker/) or [DateField](/components/date-field/) for a day.
- For a moment on a day, combine one of them with a TimeField in your own state.

## Values and forms

A time is a local `HH:mm` clock time with no date, time zone, or offset. A value with seconds, such as `09:30:45` from a database column, is accepted and shown, emitted, and submitted as `HH:mm`. A cleared field reports null, and a named field submits `HH:mm` or an empty string. The TimeField in a form example shows a time with seconds, clears it to null, and reads the submitted value.

Bounds are compared at minute precision, and the minimum cannot be later than the maximum, so a window that crosses midnight cannot be written as bounds. Any time zone or overnight rule is the application's. The [Behavior](#behavior) section also lists how a reset treats a controlled and an uncontrolled field.

## Content

- Name the time by the event it belongs to, such as Opens at or Start time, not Time.
- Put a time zone or an overnight rule in the description, since the field holds neither.

## Common mistake

Passing a date-time or a time with an offset, such as `2026-08-26T09:30` or `09:30+10:00`. TimeField throws a TypeError for anything but `HH:mm`, `HH:mm:ss`, or `HH:mm:ss.fraction`, so strip the date and offset first.
