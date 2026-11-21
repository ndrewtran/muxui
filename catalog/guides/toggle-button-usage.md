# ToggleButton usage

Use ToggleButton for toggling a persistent mode or option. Keep its Mux UI-owned props and accessible name semantics intact.

## ToggleButton or an alternative

- Use ToggleButton for a mode or option that stays on until it is turned off and applies at once, such as Bold in an editor toolbar.
- Use [Button](/components/button/) for an action that runs once, such as Save.
- Use [Switch](/components/switch/) for a setting on a settings surface, and [Checkbox](/components/checkbox/) for an option that a form submits.
- Use [ToggleButtonGroup](/components/toggle-button-group/) for related toggles that belong together.

## Default or quiet

- Use the default treatment where a toggle stands alone or among a few tools: a selected ToggleButton is filled.
- Use the quiet variant for a toggle repeated down a list, such as a pin on every row, where a column of filled squares would crowd the list. It draws no outline and no selected fill, and its selected text turns from muted to strong.
- Change the glyph with the state on a quiet ToggleButton, such as an outlined pin that fills when pinned, and keep its name the same, so the state is not shown by colour alone. The Quiet ToggleButton example shows it.
- Quiet is not available inside a [ToggleButtonGroup](/components/toggle-button-group/), which draws its own selected fill.

## Content

- Name the toggle with the mode or option it controls, such as Bold, not an action such as Toggle bold.
- Keep the label the same whether the toggle is on or off, since the selected style shows the state.
- An svg placed directly beside the label takes the same icon size as in a [Button](/components/button/), so the ToggleButton keeps its control height. To size an icon yourself, follow the Button guidance.

## Size in a group

A ToggleButton inside a ToggleButtonGroup takes the size of the group unless it sets its own, and its own size takes precedence. The Basic and Multiple selection ToggleButtonGroup examples show ToggleButtons in a group.

## Focus and keyboard

- A ToggleButton outside a group shows a short pressed fill while a pointer or Space holds it, apart from its hover and selected fills.
- A formatting tool beside a text editor can keep focus and the text selection in the editor on a pointer press. The keyboard still reaches it with Tab or a Toolbar's arrow keys, shows the focus ring, and toggles it with Enter or Space. The ToggleButton that keeps focus on press example shows it.
- Keep focus on press only where the keyboard path to the tool remains, such as a Toolbar beside the editor.
- With reduced motion, colour changes apply at once. Server markup carries the selected state, so a ToggleButton renders the same before and after hydration.

## Common mistake

Changing the label with the state, such as Show grid and Hide grid. The label then names the next action, so it reads as an action button. Keep one label and let the selected state show.
