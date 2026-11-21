---
id: muxui:guide:button-usage
---

# Button usage

Use Button for an immediate action. Use a link for navigation.

For React, import `Button` from `@muxui/react` and provide visible content
or an accessible label. Use `pending` while an immediate action is in flight;
pending Buttons remain focusable but do not activate again.

The [API reference](#api-reference) lists the `variant` and `size` values and
their defaults, derived from the React source. Express a destructive action with
one of the `danger` variants; there is no separate `tone` property.

## Choosing a variant

Choose the variant from the action's emphasis, then from its consequence.

- `primary` is the main affirmative action of a group, such as Save or Continue. Give each group one.
- `neutral` is a lower-emphasis action beside the main one, such as Cancel or Back.
- `ghost` is the lowest emphasis, such as Reset or an action in a toolbar.
- `danger` is a destructive action that is the main action of its group, such as Delete in a confirmation.
- `danger-neutral` and `danger-ghost` are destructive actions at the lower emphasis of `neutral` and `ghost`, such as Remove in a list row.
- `inverse` is chosen by the surface it sits on, not by emphasis. It fills with the strong neutral, dark in the light theme and light in the dark theme.

The Button emphasis in groups example shows one main action with lower-emphasis neighbours, a destructive confirmation, and a destructive action in a row.

## Content

- Start the label with the verb for the result, such as Save changes or Delete project, not OK or Yes.
- Keep the label a short phrase that reads on its own, without the text around it.
- For an action with no visible text, use [IconButton](/components/icon-button/).

## An icon beside the label

Place a decorative icon directly in the Button, before or after the label. An svg placed there takes the Button's icon size: 1rem at the small size, as in IconButton, and Button's icon size role, 1.25rem by default, at the medium and large sizes. To give one icon another size, set the svg's width and height with CSS, such as a class; its width and height attributes do not change it.

The Button keeps its control height for an icon no taller than the control, placed directly beside the label or in a wrapper displayed as flex. In an inline or block wrapper, the icon sits on a line of text, and the space below that line can make the Button taller.

## Corner radius

At the medium and large sizes, a Button takes its corners from the Button radius role, which defaults to the theme's control radius. The small size (`sm`) takes the theme's option radius instead, the radius that list options, rows, fields and small ToggleButtons also use, so setting the Button radius role leaves small Buttons as they are. IconButton follows the same rule.

A theme sets the two roles separately. Changing the option radius also changes the options, rows and fields that share it:

```css
:root {
  /* Button and IconButton at the medium and large sizes */
  --muxui-component-button-radius: 4px;
  /* Button and IconButton at the small size, with options, rows and fields */
  --muxui-semantic-shape-option-radius: 4px;
}
```

To give one small Button or IconButton a different corner, such as a round one, set the option radius on that element. Only that element and anything inside it change:

```css
.round-button {
  --muxui-semantic-shape-option-radius: var(--muxui-semantic-shape-pill-radius);
}
```

This holds for a button on its own. Inside an attached ButtonGroup or a Toolbar, the group or the toolbar can set the corners instead.

## Common mistake

Giving every action in a group the `primary` variant. When all of them are primary, none reads as the main action. Keep one `primary` and move the others to `neutral` or `ghost`.

## In a form

Button renders a native button, so inside a form it does not submit or reset the form unless it is given the native `submit` or `reset` type. Handle the submission on the form's submit event, where the application can prevent the native submission and read the field values from the form's data. The Button in a form example shows a submit Button, a reset Button, and a submission handled by the application.

Button does not track a request. The application sets pending when its work starts and clears it when the work ends. A pending Button stays focusable and does not activate, so a pending submit Button does not submit its form by click or by Enter in a field. A server-rendered pending submit Button is disabled until it hydrates, so it is not focusable until then. A script that calls `requestSubmit` with a pending submit Button as the submitter is application code and is not blocked. A disabled Button is natively disabled, so it is neither focusable nor activatable. The [API reference](#api-reference) lists the props Mux UI defines; native button attributes such as `type` pass through to the button element.
