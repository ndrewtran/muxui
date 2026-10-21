# Lightbox usage

Use Lightbox to view one item of a collection in a modal. Give each item a key and render the selected item's content with a render function.

## Lightbox or an alternative

- Use Lightbox to open one image or video from a collection and step through the rest.
- Use [Image](/components/image/) to show media inline in the page.
- Use [Dialog](/components/dialog/) for modal content that is not a collection of media.

## Gallery controls

A gallery with several items shows Close, Previous, Next, and a Caption in the popup, as the Lightbox with viewer controls example does.

- Previous and Next are disabled at the first and last item. Set `loop` to wrap around; it is off by default.
- Arrow keys and swipes also move between items.
- Caption shows the selected item's label unless you give it children.
- Caption is one line, and a long caption is cut off with an ellipsis.

## Content

- Give each item a short `label`, such as Dawn. It is the default Caption.
- Put essential detail, such as a description, credit, or instruction, in the content, not in the Caption.

## Common mistake

Putting a long description in the Caption. The Caption is one line and cuts long text off with an ellipsis, so move anything the user needs to read into the content.

## Rendering content

The render function on Lightbox receives the selected item and a context with its key, its index, and the item count. LightboxContent can take its own render function, which receives the same facts in one object and takes precedence. Without either, LightboxContent renders its children. The Lightbox render functions example shows one of each with self-contained images.

## Item keys

Each item needs a key that is a string or a finite number, and keys must be unique. A single invalid or repeated key makes the whole collection empty, and an empty collection never opens.

## Controlled selection

Control the selection with `selectedKey` and `onSelectedChange`, and the open state with `open` and `onOpenChange`. Pressing a trigger asks to select its item, when it is not already selected, and to open the Lightbox, so a controlled owner applies both.

- A `selectedKey` of `null` means nothing is selected. A Lightbox with nothing selected shows nothing, and if it is open it calls `onOpenChange(false)`.
- If the selected item is removed and other items remain, a controlled Lightbox does not pick another item. It calls `onSelectedChange(null, null)` and, if it is open, `onOpenChange(false)`, once each.
- Apply both by setting `selectedKey` to `null` and `open` to false, or choose another key. The Lightbox repeats neither request while the props stay unchanged.
- If every item is removed, the Lightbox only asks to close. It calls `onOpenChange(false)` once if it is open, and no selection callback.
- An uncontrolled Lightbox with items left falls back to the first item and closes if it is open.

The [Behavior](#behavior) section lists the details, and the [API reference](#api-reference) lists the props Mux UI defines.
