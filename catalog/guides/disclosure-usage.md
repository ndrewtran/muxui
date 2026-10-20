# Disclosure usage

Use Disclosure for progressively revealing related content. Keep its Mux UI-owned props and accessible name semantics intact.

## Disclosure, DisclosureGroup, or Tabs

Choose by how the content relates, and whether people need several sections in view at once.

| The content is | Use |
| --- | --- |
| Optional detail about one thing, such as advanced options | Disclosure |
| Related sections that people read together or compare, such as FAQ answers | [DisclosureGroup](/components/disclosure-group/) |
| Alternative views of one subject, shown one at a time, such as a project's Overview and Activity | [Tabs](/components/tabs/) |

## Title and panel

Disclosure takes a title and children. The title is the content of the trigger button and the children fill the panel, so there is no separate title part. The [API reference](#api-reference) lists the props Mux UI defines.

## Collapsed panels

Collapsing a Disclosure does not unmount its panel. The content stays mounted, so a field keeps its value and an effect keeps running while the panel is closed, and the application owns the lifetime of that data. A collapsed panel is inert, so its controls cannot be focused or clicked, and collapsing while focus is inside the panel moves focus to the trigger. The Disclosure with a form field example collapses a panel from a button inside it.

## Content

- Make the title a short phrase that names what is inside, such as Shipping options, so people can decide whether to open it.
- Put in the panel only what supports the title.

## Common mistake

Hiding content people need to finish the task, such as the error that blocks a form, in a collapsed panel. It is easy to miss there, so keep required content visible and collapse only what is optional.
