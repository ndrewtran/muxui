# Menu usage

Use the Mux UI Menu contract and provide an accessible name.

## Menu or other controls

- Use Menu for secondary commands that would crowd the screen if every one were shown.
- Keep the commands people use most visible, as [Button](/components/button/) controls or in a [Toolbar](/components/toolbar/), not inside a menu.
- Use [Select](/components/select/) to choose a value that stays set, not to run a command.

## Grouping commands

- Keep the menu flat. Group the secondary commands in named sections, with a separator between unrelated groups.
- Use a submenu only for a clearly subordinate group, such as Share, and keep it to one level.

The Menu for secondary commands example puts the main action beside the menu and groups the rest in named sections. The Nested React Menu example adds one Share submenu.

## Checked options

- Set `selectionMode` to `single` when the menu chooses one option of several, such as a text style, and to `multiple` for settings that are each on or off. Each item exposes whether it is checked to assistive technology.
- A checked item shows a check mark, and every item keeps the space for one so the labels align. Pressing a checked option of a `single` menu keeps it checked, and a `single` menu takes at most one checked ID.
- Checked is not current. Mark the item for the page or view people are on with `aria-current`, and keep checking for a choice they make.
- A checkable item still closes the menu by `shouldCloseOnSelect`; set it to `false` to let people check several settings in one visit.

The Menu with checkable items and shortcuts example checks one text style at a time.

## Shortcuts

- Show an item's keyboard shortcut with Menu.Shortcut at the end of the item. Its key caps are decoration hidden from assistive technology, so state the same shortcut on the item with `aria-keyshortcuts`.
- Menu.Shortcut only shows keys. The application registers the shortcut, and the label should match the keys of the platform it runs on.

The Menu for secondary commands example shows the shortcut of its Duplicate page command.

## Content

- Start each item with the verb for what it does, such as Duplicate page.
- Name each section for what its commands have in common, such as Edit or Export.
- Give every item a stable string `id`, and a `textValue` when its content is more than plain text.

## Common mistake

Putting the main action of a screen, such as Publish, inside a menu. It then costs an extra click on every use, so make it a Button and keep the menu for the rest.
