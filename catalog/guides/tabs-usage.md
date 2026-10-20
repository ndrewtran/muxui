# Tabs usage

Use the Mux UI Tabs contract and provide an accessible name with `aria-label` or `aria-labelledby`. The `variant` defaults to `underline`, which keeps the selected indicator to the label width. Use `pill` or `overflow` for an inverse filled rounded surface, or `segment` for a filled rail whose tabs size to their labels and horizontal padding.

All variants support horizontal and vertical orientation. The `overflow` variant adds scroll arrows and keeps keyboard-focused tabs in view when the list exceeds its viewport. Reduced-motion preferences settle the selected shape immediately.

## Tabs, Disclosure, or links

- Use Tabs for alternative views of one subject, shown one at a time, such as a project's Overview, Activity, and Team.
- Use [Disclosure](/components/disclosure/) or [DisclosureGroup](/components/disclosure-group/) when sections should stay in the page and several can be open together to compare.
- Use [Link](/components/link/) or [HeaderNav](/components/header-nav/) to go to another page. Tabs switch panels on the current page.

## Choosing a variant

The variants are visual choices, and none carries a meaning of its own. Pick the one that suits where the tabs sit. The Tabs variants example shows each in a context.

- Underline suits the sections of a page, such as Overview, Activity, and Team.
- Pill suits a short row of filters above a list, such as All, Open, and Closed.
- Segment suits a few peer views inside a card or panel, such as Day, Week, and Month.
- Overflow answers a space limit. Use it when the tabs can be wider than their container, because it adds scroll arrows.

## Keyboard activation

- By default, an arrow key selects the tab it reaches, which suits panels that appear at once.
- Set `keyboardActivation` to `manual` when showing a panel is slow or has side effects, such as loading data or starting a request. Arrow keys then only move focus, and Enter or Space selects the focused tab.

## Content

- Label each tab with a short noun, such as Activity.
- Give every item a stable `id`. The selected `value` is one of those ids.

## Common mistake

Keeping the automatic default for panels that load data. Moving across the tabs with the arrow keys selects every tab it passes, so each one loads. Set `keyboardActivation` to `manual`.
