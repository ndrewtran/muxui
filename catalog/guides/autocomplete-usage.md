# Autocomplete

Use `label` or an explicit `aria-label`/`aria-labelledby` name. Suggestions are filtered by the Mux UI input value and open in a non-modal, anchored portal below the input without shifting surrounding content. The overlay closes on Escape, outside interaction, or selection, and its list scrolls when it exceeds the available viewport space. `items` accept strings or `{id, label, value}` records; `onSelect` receives the Mux UI record.
