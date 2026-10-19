# CommandPalette usage

Use CommandPalette for keyboard-first search and activation of application commands. The application supplies the commands and their results, either directly or through the useCommandPalette hook.

## Parts the application drives

Several parts only draw what the application gives them. Shortcut shows key text and registers no key, so the application listens for the key itself. LoadMoreItem and the chips (Chips, Chip, and ChipRemove) are structural too: the application holds the pagination and chip data and handles loading and removal. Description is a visible paragraph that is not linked to the Popup, so the application gives it an id and passes that id to the Popup to connect them. The CommandPalette parts the application drives example puts each of these in a working palette. The [Behavior](#behavior) section lists the details, and the [API reference](#api-reference) lists the props Mux UI defines.
