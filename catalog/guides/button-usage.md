---
id: muxui:guide:button-usage
---

# Button usage

Use Button for an immediate action. Use a link for navigation.

For React, import `Button` from `@muxui/react` and provide visible content
or an accessible label. Use `pending` while an immediate action is in flight;
pending Buttons remain focusable but do not activate again.

React Buttons support the finite `variant` values `primary`, `neutral`, `ghost`,
`danger`, `danger-neutral`, `danger-ghost`, and `inverse`, along with the `size`
values `sm`, `md`, and `lg`. They default to `primary` and `md`. Express a
destructive action with one of the `danger` variants; there is no separate
`tone` property.

## In a form

Button renders a native button, so inside a form it does not submit or reset the form unless it is given the native `submit` or `reset` type. Handle the submission on the form's submit event, where the application can prevent the native submission and read the field values from the form's data. The Button in a form example shows a submit Button, a reset Button, and a submission handled by the application.

Button does not track a request. The application sets pending when its work starts and clears it when the work ends. A pending Button stays focusable and does not activate, so a pending submit Button does not submit its form by click or by Enter in a field. A server-rendered pending submit Button is disabled until it hydrates, so it is not focusable until then. A script that calls `requestSubmit` with a pending submit Button as the submitter is application code and is not blocked. A disabled Button is natively disabled, so it is neither focusable nor activatable. The [API reference](#api-reference) lists the props Mux UI defines; native button attributes such as `type` pass through to the button element.
