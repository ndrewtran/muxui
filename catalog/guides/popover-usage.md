# Popover usage

Use Popover for anchored contextual content. Provide a focusable trigger and an accessible name for the dialog surface.

## Modal or non-modal

Popover is modal by default. Choose by whether the user keeps browsing the page while it is open.

- Set `modal={false}` for information or an action the user may check while browsing, such as the details of the selected item.
- A non-modal Popover has no focus containment, outside-content exclusion, or scroll locking, so the page stays usable.
- Keep the default for a small interaction the user finishes before going back to the page, such as renaming an item.
- A modal Popover contains focus until it closes.
- Use [Dialog](/components/dialog/) instead of a modal Popover when the content is a task of its own, with several fields or steps, rather than a small interaction tied to its trigger.

The Popover modes example shows a non-modal details Popover with an action and a modal rename Popover.

## Content

- Keep the content to what the trigger names: a few lines of information, or one small control with its action.
- Name the dialog surface for what it holds, such as Report details, with `aria-label`.

## Color scheme

A Popover's own surface is strong and inverted against its page, so Mux UI components inside it, whose text follows the page's color scheme, do not read on it. For a panel of controls, such as a settings panel, set a color scheme on the Popover: the panel then becomes a surface of that scheme, with that scheme's components inside, whatever the page uses. A preset theme on the page carries into it. The Popover color scheme example shows a dark panel on a light page with a preset theme, the generated [Popover reference](/components/popover/) lists the prop, and the [Behavior](#behavior) section says what the panel reads from around its trigger and when it picks up a change.

## Common mistake

Leaving the default `modal` on a Popover that only shows information. It contains focus and locks page scrolling, so the user cannot scroll or tab through the page while reading. Set `modal={false}` for anything the user may want to compare with the page.

## A Popover that is not dismissable

A Popover that is not dismissable ignores Escape, outside presses, and its trigger, in modal and non-modal mode alike, so give its content a button in the close slot. That button closes an uncontrolled Popover directly. A controlled owner receives the close request through the open-change callback and decides whether to close. The Non-dismissable Popover example shows an uncontrolled modal Popover and a controlled non-modal one. The [Behavior](#behavior) section lists how each mode closes.
