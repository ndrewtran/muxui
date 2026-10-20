# PreviewTrigger usage

Use PreviewTrigger for supplementary interactive previews, provide an accessible name, and keep essential content in the page flow.

## PreviewTrigger or an alternative

- Use PreviewTrigger for extra detail on an item the user can already use without it, such as a summary of a report the link opens.
- Use [Popover](/components/popover/) for content that opens on a press and stays open.
- Use [Tooltip](/components/tooltip/) for a short, non-interactive description of a control.

## On the link or on a separate control

The preview opens after a hover delay, on touch long press, and on keyboard focus, whichever element is the trigger. Choose the trigger by how much the user needs to know the preview exists.

- Put the preview on the item's link when the preview only adds detail. The link stays the one control, and pressing it still navigates.
- Nothing on screen says a link-owned preview exists, and each link in a list opens its preview when keyboard focus reaches it.
- Add a separate preview control beside the link when people should find the preview without hovering. The control is visible and has a name of its own, and the link only navigates.
- A separate control adds a control, and a place to stop, for every item.

The PreviewTrigger on a link or a separate control example shows both.

## Content

- Lead the preview with what the user would learn by opening the item, such as Revenue by region, 4 pages.
- Name a separate preview control for its item, such as Preview Annual report, not just Preview.

## Common mistake

Keeping something the user needs only in the preview. It appears only on hover, focus, or long press, so the user may never see it. Put anything essential in the page.

## Keyboard and focus

Opening the preview does not move focus: a keyboard user stays on the trigger, and a user typing elsewhere keeps typing. When the preview holds something focusable, Tab moves into it, and Escape closes the preview and returns focus to the trigger. The PreviewTrigger with a focusable control example puts a Button in the preview.

## Disabled previews

A disabled preview does not open, and an open one closes. Its trigger is not disabled: it stays operable and gets no disabled attribute. The [Behavior](#behavior) section lists the details.
