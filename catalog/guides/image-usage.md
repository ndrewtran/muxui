# Image usage

Use Image to present a photo, screenshot, diagram, or illustration. It renders a native image, so size, loading, and events follow the browser.

## Choosing a fit

`fit` sets how the picture fills the box you declare with `width` and `height`. It changes nothing while the box and the picture have the same proportions, so choose it by what cropping would cost the viewer.

- `cover`, the default, fills the box and crops what overflows. Use it where the edges are expendable, such as a photo thumbnail.
- `contain` keeps the whole picture and leaves empty space in the box. Use it for a screenshot, diagram, or product detail that must stay complete.
- `fill` stretches the picture to the box and distorts it, so avoid it for photos and diagrams.
- `none` keeps the picture at its own size and clips it to the box.

The Image fit example shows one wide diagram under `cover` and `contain` in a square box.

## Content

- Give `alt` text that says what the picture shows in its context, and `alt=""` when it is only decoration.
- Set both `width` and `height`, so the box keeps its proportions while the picture loads.
- Add `fallbackSrc` for a source that can fail. The Image fallback recovery example shows the single retry.
- For a person or workspace, use [Avatar](/components/avatar/). To open a larger view, use [Lightbox](/components/lightbox/).

## Common mistake

Leaving the default `cover` on a screenshot or diagram in a box with other proportions. The edges are cropped without any warning, and a label or axis at the edge can be lost. Match the box to the picture, or set `fit="contain"`.
