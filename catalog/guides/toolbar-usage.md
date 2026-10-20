# Toolbar usage

Use the Mux UI Toolbar contract and provide an accessible name.

## Toolbar, ButtonGroup, or ToggleButtonGroup

Choose by what the controls share.

| The controls are | Use |
| --- | --- |
| Mixed commands and toggles that people move between with the arrow keys | Toolbar |
| Related actions shown together, each reached with Tab | [ButtonGroup](/components/button-group/) |
| Toggles that share one selection, such as a text alignment | [ToggleButtonGroup](/components/toggle-button-group/) |

## Buttons in a toolbar

Toolbar restyles the Buttons that are its direct children: they lose their fill, border, and shadow and take the toolbar's neutral text, whatever their variant. A Button wrapped in another element, or placed outside the Toolbar, keeps its own appearance. The Toolbar with a separate action example puts a Button beside a Toolbar.

A Toolbar holds commands of equal weight, so give its Buttons no variant. Keep the main action of the surface outside it, as Publish is in that example, so it keeps its emphasis.

## Vertical toolbar

Set `orientation` to `vertical` to stack the controls in a column, each filling the Toolbar's width, with Up and Down moving between them.

The application owns the Toolbar's width and where it sits. A Toolbar is a block, so in a block parent it fills the parent's width, and in a flex row it takes the width of its controls. Give the parent a width, as the vertical Toolbar in the Toolbar with a separate action example does, and the controls stretch to it.

## Content

- Label each control with the verb or noun for what it does, such as Save or Preview.
- Keep the labels short so the controls fit together.

## Common mistake

Giving the Buttons in a Toolbar different variants to rank them. Direct-child Buttons all take the same flat appearance, so the variants do nothing. Leave the variants off and keep the main action outside.
