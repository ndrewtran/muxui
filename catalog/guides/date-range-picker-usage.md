# DateRangePicker

Date values are Mux UI ISO strings (`YYYY-MM-DD`). Set `startName` and `endName` for form submission; Mux UI owns paired hidden inputs and resets them with the form. The picker's calendar parts are built in and not exported.

## DateRangePicker or RangeCalendar

Choose by whether the range is a form field.

- Use DateRangePicker for a start and end date in a form field, typed or chosen from a calendar popup.
- Use [RangeCalendar](/components/range-calendar/) to show the months on the page, such as in a booking panel. It is not a form field.
- For one date, use [DatePicker](/components/date-picker/). For two dates that need not be contiguous, use two DatePickers.

## Range values

A range is null or a complete pair of start and end dates, and a one-day range is valid. `unavailableDateMatcher` also receives the anchor, which is the start date chosen so far, so a rule can depend on the start. The range example limits a trip to seven days from its start this way. The [Behavior](#behavior) section lists the shape, ordering, and contiguity rules.

## In a form

Each endpoint is its own form entry, and server errors keyed by either endpoint name show as one error message on the field. A controlled range is not changed by a reset, so the application restores it in the form's reset handler, while an uncontrolled range returns to its default. The DateRangePicker in a form example shows an endpoint-keyed error and a controlled reset. The [Behavior](#behavior) section lists when errors are dismissed, and the [API reference](#api-reference) lists the props.

## Content

- Name the range by what it spans, such as Stay or Trip dates, not Dates.
- Say a rule that limits the range in the description, such as Up to seven days, because dates beyond it simply cannot be chosen.

## Common mistake

Passing a half-set range, such as a start with no end, as the value. A range is null or a complete pair, so use null for no range.
