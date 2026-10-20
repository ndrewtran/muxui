# CommandPalette usage

Use CommandPalette for keyboard-first search and activation of application commands. The application supplies the commands and their results, either directly or through the useCommandPalette hook.

## CommandPalette or an alternative

| The user | Use |
| --- | --- |
| Searches many commands from anywhere in the application | CommandPalette |
| Picks one of a few actions from a control | [Menu](/components/menu/) |
| Picks a value for a form field by typing | [ComboBox](/components/combo-box/) |

## Content

- Title each command with a verb and its object, such as Open settings or Export report.
- Give a command a `subtitle` for one line of context, and `keywords` for words people search that the title does not contain.
- Group commands under short nouns, such as Help and Workspace.
- Make the empty message say that nothing matched, such as No matching commands.

## Commands that take time

The hook keeps no progress for a command, so the application records it per command and shows it on the command's row.

- While a command runs, change the row's description and disable the row so it cannot start twice.
- A failed command keeps the palette open. Record the failure in `onError`, and say on the row what went wrong and that activating it again retries.
- When a command succeeds, the hook calls the `close` you pass it, so the palette closes.

The CommandPalette commands that take time example shows both outcomes.

## Common mistake

Letting an asynchronous command fail with nothing on screen. Without `onError`, a failure goes to the global error reporter or the console, and the palette stays open with no sign of what happened. Record the failure and show it on the command's row.

## Parts the application drives

Several parts only draw what the application gives them. Shortcut shows key text and registers no key, so the application listens for the key itself. LoadMoreItem and the chips (Chips, Chip, and ChipRemove) are structural too: the application holds the pagination and chip data and handles loading and removal. Description is a visible paragraph that is not linked to the Popup, so the application gives it an id and passes that id to the Popup to connect them. The CommandPalette parts the application drives example puts each of these in a working palette. The [Behavior](#behavior) section lists the details, and the [API reference](#api-reference) lists the props Mux UI defines.
