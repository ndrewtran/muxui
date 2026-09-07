---
id: muxui:guide:accessibility
---

# Accessibility

Accessibility obligations are part of every component's canonical binding. The
component reference lists the required accessible name, states, parts, and
binding obligations alongside its API.

## Names and relationships

Provide visible content or an explicit accessible name whenever a binding
requires one. Fields keep their declared labels, descriptions, and errors
attached to the interactive surface. Composite controls keep the relationships
between their label, description, error, and control intact.

## Interaction states

Disabled, pending, selected, expanded, invalid, read-only, and busy states are
exposed through the React binding where the component declares them. Use the
finite state props documented for the component rather than adding an
application-only visual state.

## Keyboard and focus

Collection, overlay, disclosure, and editor components preserve their declared
keyboard behavior. Dialog dismissal returns focus to its trigger. Collection
components expose the selection and action events declared by their binding.

## Verification

Test the interaction with keyboard navigation and a screen reader in the
consumer application. Forced-colors, high-contrast, direction, and focus-ring
requirements remain part of the binding's platform-safety contract.
