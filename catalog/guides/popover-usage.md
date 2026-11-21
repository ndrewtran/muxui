# Popover usage

Use Popover for anchored contextual content. Give it a focusable trigger, or open it from code against an anchor, and an accessible name for the dialog surface.

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

## Open it from code

Leave out the trigger when something other than one toggle opens the Popover, such as a toolbar tool, a menu item or a keyboard shortcut.

- Without a `trigger`, only `open` or `defaultOpen` opens the Popover, and `anchorRef` is required: it names the element the Popover is placed against.
- The anchor can be larger than the control that opens it, such as the whole toolbar, so the Popover lines up with the row rather than one tool.
- Name the surface with `aria-label` as usual. Escape inside it, an outside press and the close slot reach your open-change callback.
- A press on the anchor of a non-modal Popover is not an outside press, even with focus inside the Popover. A modal Popover leaves the page inert, so a press where its anchor is closes it, as any press outside does.
- The Popover follows its anchor each time it renders: a replaced anchor, or one that layout has moved, places it again, and while the anchor is gone it stays where it was. A scroll leaves a modal Popover where it is and closes a non-modal one.
- The server renders nothing of the Popover, and one open from the start opens after hydration. Reduced motion is read from around the anchor.
- An overlay anchored to an element inside a sheet, a Popover or any other, must be rendered inside that sheet's children so it moves with the sheet. One rendered outside them stays where it was placed while the sheet moves.
- A Popover that mounts open in the same update as the overlay around it, such as a sheet, a centred Dialog or another Popover, or as a menu rendered before it, opens on top of that overlay, takes focus, and closes first. Any other Popover that mounts open opens at once, so its content is in the page when your effects run, as when one selects the text of a field inside it.
- The Popover opened from code example opens an address field from a Link tool and places it under the toolbar.

## Keep it inside a region

- Set `boundaryRef` when the Popover must stay inside an element smaller than the viewport, such as an embedded app or a sheet: it flips, shifts, narrows and shortens to fit, `containerPadding` from the region's edges: text wraps to the room left, and content taller than that scrolls inside it.
- The Popover inside a boundary example keeps the Popover of a button in a region's corner inside that region.

## Where focus goes

- A modal Popover focuses its own surface when it opens. Set `initialFocusRef` to an element inside it, such as its only field, to focus that instead, in one move; the Popover initial focus example does this for a rename field.
- Closing returns focus to the element that was focused when the Popover opened. When that element may be removed, hidden or disabled by then, set `returnFocusRef` to where focus goes instead.
- The Popover return focus example sends focus to its New report button after a row and its Actions trigger are deleted.

## Wrap it in a component

A component that wraps Popover and sets some props itself, such as the name, types the rest with PopoverPropsWithout and the names of those props. TypeScript's Omit merges the two forms of the Popover's props, with a trigger and with `anchorRef` alone, so the rest would fit neither; PopoverPropsWithout leaves the props out of each form apart.

## Color scheme

A Popover's own surface is strong and inverted against its page, so Mux UI components inside it, whose text follows the page's color scheme, do not read on it. For a panel of controls, such as a settings panel, set a color scheme on the Popover: the panel then becomes a surface of that scheme, with that scheme's components inside, whatever the page uses. A preset theme on the page carries into it. The Popover color scheme example shows a dark panel on a light page with a preset theme, the generated [Popover reference](/components/popover/) lists the prop, and the [Behavior](#behavior) section says what the panel reads from around its trigger and when it picks up a change.

## Common mistake

Leaving the default `modal` on a Popover that only shows information. It contains focus and locks page scrolling, so the user cannot scroll or tab through the page while reading. Set `modal={false}` for anything the user may want to compare with the page.

## A Popover that is not dismissable

A Popover that is not dismissable ignores Escape, outside presses, and its trigger, in modal and non-modal mode alike, so give its content a button in the close slot. That button closes an uncontrolled Popover directly. A controlled owner receives the close request through the open-change callback and decides whether to close. The Non-dismissable Popover example shows an uncontrolled modal Popover and a controlled non-modal one. The [Behavior](#behavior) section lists how each mode closes.
