# PreviewTrigger usage

Use PreviewTrigger for supplementary interactive previews, provide an accessible name, and keep essential content in the page flow.

## Keyboard and focus

Opening the preview does not move focus: a keyboard user stays on the trigger, and a user typing elsewhere keeps typing. When the preview holds something focusable, Tab moves into it, and Escape closes the preview and returns focus to the trigger. The PreviewTrigger with a focusable control example puts a Button in the preview.

## Disabled previews

A disabled preview does not open, and an open one closes. Its trigger is not disabled: it stays operable and gets no disabled attribute. The [Behavior](#behavior) section lists the details.
