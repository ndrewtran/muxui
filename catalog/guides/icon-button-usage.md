# IconButton usage

Use `IconButton` for an action represented by one icon. Import it from
`@muxui/react` and load `@muxui/react/styles.css` once in your application.
Provide your own icon as children; Mux does not require a particular icon library.

```tsx
import { IconButton } from '@muxui/react';

<IconButton aria-label="Close panel" onActivate={() => closePanel()}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
</IconButton>
```

An accessible name is required. Use `aria-label` or `aria-labelledby` pointing
to an existing element with meaningful text. Missing or entirely blank names
are rejected. The icon wrapper is decorative; avoid focusable or interactive
children. A tooltip can help explain an unfamiliar icon but does not replace
the required accessible name.

The defaults are `variant="ghost"`, `size="md"`, `tone="default"`,
`disabled={false}`, and `pending={false}`. Variants, tone, `onActivate`, refs,
and native button/form attributes follow `Button`. The `sm`, `md`, and `lg`
sizes are square, with minimum heights aligned to Mux buttons. Theme control and spacing
tokens determine their dimensions. Use `Button` when visible text is needed.

`pending` replaces the icon with a static indicator, preserves the accessible
name and focusability, and blocks activation without changing the button size.
`showTextWhileLoading` is intentionally unavailable. `disabled` uses the normal
disabled button behavior. The default `type="button"` does not submit a form;
set `type="submit"` explicitly for a submit action.

When adapting an existing icon-button implementation, use `onActivate` for
activation and `disabled` / `pending` for state. Mux adds Button's existing
variant choices, uses its own square sizing, and shows a static pending
indicator. No additional CSS or package dependency is required.
