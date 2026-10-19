# Tooltip usage

Use Tooltip with a focusable trigger and concise descriptive content. Never make essential instructions hover-only.

## Icon-only triggers

A Tooltip describes its trigger. It does not name it, so a trigger that shows only an icon needs its own accessible name, and the Tooltip text adds a description to that name. IconButton requires an accessible name. The Tooltip on an icon button example gives an IconButton its own name and a Tooltip.

## Content

Tooltip content describes the trigger and is not interactive: the Tooltip surface ignores pointer events, so a link or button inside it cannot be clicked. Use a Popover, a PreviewTrigger, or a Dialog for content someone needs to act on. The [Behavior](#behavior) section lists the details.
