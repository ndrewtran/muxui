# DateField

Use the Mux UI React DateField binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## DateField or DatePicker

Choose by how far the date is from today.

- Use DateField for a historical or precisely known date, such as a birthday, where typing is faster than paging a calendar.
- Use [DatePicker](/components/date-picker/) for a date near today, such as a due date, where a calendar helps. It keeps the same typed entry.
- For a time of day, use [TimeField](/components/time-field/). For a start and end date, use [DateRangePicker](/components/date-range-picker/).

## Values and forms

A date is a `YYYY-MM-DD` string, whatever order the segments show for the user's locale, with no time or time zone. A cleared field reports null, and a named field submits `YYYY-MM-DD` or an empty string. The DateField in a form example supplies a date, clears it to null, and reads the submitted value. The [API reference](#api-reference) lists the props.

## Content

- Name the date by its role, such as Birthday or Start date, not Date.
- Leave the format out of the label. The segments follow the order of the user's locale, so a hint such as DD/MM/YYYY can be wrong.

## Common mistake

Passing a Date object, a timestamp, or a date with a time as the value. DateField throws a TypeError for anything but a `YYYY-MM-DD` string, so format the date first.
