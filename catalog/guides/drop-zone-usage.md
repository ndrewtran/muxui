# DropZone usage

Give DropZone an accessible name and read the dropped items from its drop event. Pointer, keyboard, and pasted files share the same callback.

## Drop area, picker, or both

Choose by what the user is doing.

| The user is | Use |
| --- | --- |
| Uploading files to a page, where dragging is the quick path | DropZone with a clearly named [FileTrigger](/components/file-trigger/) inside it |
| Picking a file in a form or a compact space | FileTrigger alone |
| Dropping or pasting items that are not only files, such as folders or text | DropZone |

- Both entry points feed the same application pipeline, so write one function that takes File objects and call it from each.
- Keep the two reads separate: the drop event lists items that need an asynchronous read, while the FileTrigger reports a File array.
- `onActivate` does not open the picker, and a click on a FileTrigger inside the drop area does not call it.

The DropZone with a picker example drops and picks into one list.

## Reading dropped items

The drop event lists its items, and the list is not a File array. Each item is a file, a directory, or text, so narrow it by kind before reading it. Reading is asynchronous: a file item gives its File or its text, a directory item gives an async list of its entries, and a text item gives its text for a format it lists. The DropZone reading dropped items example reads all three and adds the results to a list.

DropZone filters nothing, so every dropped item arrives and the application skips the kinds it does not use. It does not catch a failed read either, so await the reads and catch their errors in the handler. DropZone only reports what was dropped: storing or uploading it is up to the application. The [API reference](#api-reference) lists the props Mux UI defines.

## Content

- Say what the area accepts, such as "Drop PNG or JPEG images here", because DropZone filters nothing.
- Name the area with `aria-label`, such as Upload images.
- Label the picker inside it with a verb and an object, such as Choose images.

## Common mistake

Handing the dropped items to code that expects a File array. They are file, directory, and text items, so read each file item with `getFile()` first, as the DropZone with a picker example does.
