# IconButton usage

Use `IconButton` for an action represented by one icon. Import it from
`@muxui/react` and load `@muxui/react/styles.css` once in your application,
after declaring your cascade layer order (`@layer reset, muxui.tokens,
muxui.components, muxui.utilities, app;`). Your unlayered rules override Mux's ordinary declarations.
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

The [API reference](#api-reference) lists the variants, sizes, and defaults,
derived from the React source. Variants, `onActivate`, refs, and native
button/form attributes follow `Button`. Every size is square, with minimum
heights aligned to Mux buttons. Theme control and spacing tokens determine
their dimensions. Use `Button` when visible text is needed.

`pending` replaces the icon with a static indicator, preserves the accessible
name and focusability, and blocks activation without changing the button size.
IconButton has no `showTextWhileLoading` prop. `disabled` uses the normal
disabled button behavior. The default `type="button"` does not submit a form;
set `type="submit"` explicitly for a submit action.

When adapting an existing icon-button implementation, use `onActivate` for
activation and `disabled` / `pending` for state. Mux adds Button's existing
variant choices, uses its own square sizing, and shows a static pending
indicator. No additional CSS or package dependency is required.

## Choosing a variant

Choose the variant from where the icon sits and what it does, as for [Button](/components/button/).

- `ghost`, the default, is for supporting actions such as Close, Search, or Settings beside other content.
- `neutral` is a supporting action that needs a visible fill to stand apart from its surroundings.
- `primary` is for one clear local primary action, such as Send beside a text field.
- `danger-ghost` and `danger-neutral` are for destructive actions, only where visible context says what they affect, such as the row of the item they remove.
- For a destructive main action, use a Button with visible text instead.

The IconButton prominence example shows a ghost toolbar, a primary Send, and a destructive Remove beside its item.

## Content

- Name the result with a verb phrase, such as Close panel or Search projects.
- When the same icon repeats across items, put the item in each name, as in Remove Quarterly report.
- For an unfamiliar icon, add a [Tooltip](/components/tooltip/) that says the same words.

## Common mistake

Styling a lone icon as destructive, such as a red trash icon in a toolbar with nothing visible that says what it deletes. The color does not state the consequence. Place the icon in the row of the item it removes, or use a Button with visible text.
