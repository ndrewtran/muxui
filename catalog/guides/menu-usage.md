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

## Content

- Start each item with the verb for what it does, such as Duplicate page.
- Name each section for what its commands have in common, such as Edit or Export.
- Give every item a stable string `id`, and a `textValue` when its content is more than plain text.

## Common mistake

Putting the main action of a screen, such as Publish, inside a menu. It then costs an extra click on every use, so make it a Button and keep the menu for the rest.
