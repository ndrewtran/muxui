---
id: muxui:guide:accessibility
---

# Accessibility

Accessibility obligations are part of every component's canonical binding. The
component reference lists the states, parts, and binding obligations alongside
its API, and each component page's Accessibility section states whether it
requires an accessible name.

## Support status

React exports are experimental, and Mux UI makes no assistive-technology
support claim for the React prerelease. The manual and assistive-technology
evidence that Decision 0022 requires before any such claim, and before stable
React promotion (`S1.0`), is deferred, not complete.

### Automated proof

The existing automated proof is axe in one browser, over a fixed set of display
profiles, and package tests of keyboard and focus behavior. Assistive
technology, zoom, locale, and other browsers are not claimed. The
[tested profile](/installation/#tested-profile) lists the browser, the display
profiles, and everything that is not claimed.

### Known limitations

A Dialog cannot return focus to the element that was focused when it opened if
that element was removed while the Dialog was open. Focus then moves to the
nearest ancestor recorded at opening that is still connected and focusable, but
only when focus would otherwise be on the document body. With no such ancestor,
focus stays on the document body.

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
keyboard behavior. Dialog dismissal restores focus to the element that was
focused when it opened, usually its trigger; [Known limitations](#known-limitations)
covers the case where that element is gone. Collection components expose the
selection and action events declared by their binding.

## Verification

Test the interaction with keyboard navigation and a screen reader in the
consumer application; Mux UI's checks do not replace that testing. Forced-colors,
high-contrast, direction, and focus-ring requirements remain part of the
binding's platform-safety contract.
