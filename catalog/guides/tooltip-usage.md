# Tooltip usage

Use Tooltip with a focusable trigger and concise descriptive content.

## Tooltip or an alternative

Tooltip content describes the trigger and is not interactive: the Tooltip surface ignores pointer events, so a link or button inside it cannot be clicked. Choose another family when the content needs more. The [Behavior](#behavior) section lists the details.

| The content | Use |
| --- | --- |
| Needs to be read and acted on, and opens on a press | [Popover](/components/popover/) |
| Previews what a link or item opens, on hover or focus | [PreviewTrigger](/components/preview-trigger/) |
| Is a task that holds the page until it is done | [Dialog](/components/dialog/) |

## Icon-only triggers

A Tooltip describes its trigger. It does not name it, so a trigger that shows only an icon needs its own accessible name, and the Tooltip text adds a description to that name. IconButton requires an accessible name. The Tooltip on an icon button example gives an IconButton its own name and a Tooltip.

## Shortcuts

- Show a tool's keyboard shortcut with Tooltip.Shortcut after the Tooltip's text. Its key caps are decoration hidden from assistive technology, so state the same shortcut on the trigger with `aria-keyshortcuts`.
- Tooltip.Shortcut only shows keys. The application registers the shortcut, and the caps should match the keys of the platform it runs on.

The Tooltip with a keyboard shortcut example gives a Bold IconButton its shortcut and shows it in the Tooltip.

## Content

- Say what the trigger does or means in a short phrase, such as Shortcuts and tips for this page.
- Add to the trigger's name rather than repeating it.

## Common mistake

Putting something the user needs only in a Tooltip. It opens on hover after a delay, or on keyboard focus, so a user who does neither may never see it. Keep essential instructions visible in the page.
