# ToggleButton usage

Use ToggleButton for toggling a persistent mode or option. Keep its Mux UI-owned props and accessible name semantics intact.

## ToggleButton or an alternative

- Use ToggleButton for a mode or option that stays on until it is turned off and applies at once, such as Bold in an editor toolbar.
- Use [Button](/components/button/) for an action that runs once, such as Save.
- Use [Switch](/components/switch/) for a setting on a settings surface, and [Checkbox](/components/checkbox/) for an option that a form submits.
- Use [ToggleButtonGroup](/components/toggle-button-group/) for related toggles that belong together.

## Content

- Name the toggle with the mode or option it controls, such as Bold, not an action such as Toggle bold.
- Keep the label the same whether the toggle is on or off, since the selected style shows the state.

## Size in a group

A ToggleButton inside a ToggleButtonGroup takes the size of the group unless it sets its own, and its own size takes precedence. The Basic and Multiple selection ToggleButtonGroup examples show ToggleButtons in a group.

## Common mistake

Changing the label with the state, such as Show grid and Hide grid. The label then names the next action, so it reads as an action button. Keep one label and let the selected state show.
