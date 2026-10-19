# Disclosure usage

Use Disclosure for progressively revealing related content. Keep its Mux UI-owned props and accessible name semantics intact.

## Title and panel

Disclosure takes a title and children. The title is the content of the trigger button and the children fill the panel, so there is no separate title part. The [API reference](#api-reference) lists the props Mux UI defines.

## Collapsed panels

Collapsing a Disclosure does not unmount its panel. The content stays mounted, so a field keeps its value and an effect keeps running while the panel is closed, and the application owns the lifetime of that data. A collapsed panel is inert, so its controls cannot be focused or clicked, and collapsing while focus is inside the panel moves focus to the trigger. The Disclosure with a form field example collapses a panel from a button inside it.
