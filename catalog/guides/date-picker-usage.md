# DatePicker

Use the Mux UI React DatePicker binding with Mux UI-owned props and values. Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## DatePicker or DateField

Choose by how far the date is from today.

- Use DatePicker for a date near today, such as a due date or a delivery day, where seeing the weekday and the days around it helps.
- Use [DateField](/components/date-field/) for a date from long ago or one the user already knows, such as a birthday, where typing is faster than paging the calendar.
- An empty DatePicker opens its calendar at the current month, so a distant date means paging away from it.
- Both take typed entry from the keyboard, so DatePicker does not take typing away.
- For a start and end date, use [DateRangePicker](/components/date-range-picker/). To show the calendar on the page, use [Calendar](/components/calendar/).

## Date and open state

The date and the open state are separate, so the application can control either one or both. The Controlled date and open state example opens the calendar from a button, clears the date, and makes weekends unavailable. The unavailable-date callback receives each date as a `YYYY-MM-DD` string. The [Behavior](#behavior) section lists what choosing and clearing a date do, and the [API reference](#api-reference) lists the props.

## Content

- Name the date by its role, such as Due date or Delivery date, not Date.
- Say why a date cannot be chosen in the description, such as Weekends are unavailable, because an unavailable date simply cannot be selected.

## Common mistake

Using DatePicker for a birthday or another distant date. The calendar opens near today, so people page through months to reach it. Use DateField so they can type the date.
