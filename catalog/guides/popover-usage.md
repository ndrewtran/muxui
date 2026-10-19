# Popover usage

Use Popover for anchored contextual content. Provide a focusable trigger and an accessible name for the dialog surface.

## A Popover that is not dismissable

A Popover that is not dismissable ignores Escape, outside presses, and its trigger, in modal and non-modal mode alike, so give its content a button in the close slot. That button closes an uncontrolled Popover directly. A controlled owner receives the close request through the open-change callback and decides whether to close. The Non-dismissable Popover example shows an uncontrolled modal Popover and a controlled non-modal one. The [Behavior](#behavior) section lists how each mode closes.
