# Banner usage

Use Banner for a notice about the whole page or site, such as planned maintenance or a new feature, shown above the content until it ends or is dismissed.

## Choosing a notice

- Use a Banner for something everyone on the page should see and that stays relevant for a while.
- To confirm what a person just did, use [Toast](/components/toast/) instead. To ask for a decision before going on, use [AlertDialog](/components/alert-dialog/).
- Show one Banner at a time, at the top of the page, and keep the message to a sentence or two.

## Tone and colour

- Pick the tone by what the notice means: `neutral` for general news, `brand` for announcements, `success`, `warning` and `danger` for the state of the site.
- Use `subtle` for most notices and `solid` for one that must stand out.
- Say what the notice is about in the `title` or the message, such as Maintenance. The tone is colour only, and colour is gone under forced colours and for many readers.
- A `customColor` must be an opaque `#rgb`, `#rrggbb` or `rgb()` colour. Its text and controls are white or black, whichever contrasts more, so any opaque colour reads; any other value falls back to the tone.

## Actions and dismissal

- Give at most two actions and one link. Banner draws them in its own colours, so they read on every tone; do not place other controls inside it.
- Name each action by what it does, such as See the schedule, and use the link to go somewhere else.
- Banner remembers nothing. Control `dismissed` and store the dismissal yourself when it should last beyond the page.
- Banner does not move focus. When the dismiss button is pressed, move focus somewhere sensible, such as the main content, in `onDismiss`.

## Announcing

- A Banner is a named region. Give it a `label` when the page has several, or let its title name it.
- Use `alert` only for a notice that needs attention at once, because it is read out as soon as it appears.
- Nothing on a Banner animates. It appears and goes at once, so an application that slides it in or out owns that motion and its reduced motion case.

The Basic React Banner example announces planned maintenance with a title, an icon, an action, a link and a dismiss button, and the Custom colour React Banner example fills one with a custom colour and keeps its dismissal.

## Common mistake

Showing the tone only by colour. A warning that says only "Saturday 02:00 to 04:00" in amber is lost under forced colours; give it a title such as Maintenance.
