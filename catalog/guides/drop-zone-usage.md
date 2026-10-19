# DropZone usage

Give DropZone an accessible name and read the dropped items from its drop event. Pointer, keyboard, and pasted files share the same callback.

## Reading dropped items

The drop event lists its items, and the list is not a File array. Each item is a file, a directory, or text, so narrow it by kind before reading it. Reading is asynchronous: a file item gives its File or its text, a directory item gives an async list of its entries, and a text item gives its text for a format it lists. The DropZone reading dropped items example reads all three and adds the results to a list.

DropZone filters nothing, so every dropped item arrives and the application skips the kinds it does not use. It does not catch a failed read either, so await the reads and catch their errors in the handler. DropZone only reports what was dropped: storing or uploading it is up to the application. The [API reference](#api-reference) lists the props Mux UI defines.
