# Lightbox usage

Use Lightbox to view one item of a collection in a modal. Give each item a key and render the selected item's content with a render function.

## Rendering content

The render function on Lightbox receives the selected item and a context with its key, its index, and the item count. LightboxContent can take its own render function, which receives the same facts in one object and takes precedence. Without either, LightboxContent renders its children. The Lightbox render functions example shows one of each with self-contained images.

## Item keys

Each item needs a key that is a string or a finite number, and keys must be unique. A single invalid or repeated key makes the whole collection empty, and an empty collection never opens. The [Behavior](#behavior) section lists the details, and the [API reference](#api-reference) lists the props Mux UI defines.
