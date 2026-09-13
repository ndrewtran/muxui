import { addons } from 'storybook/manager-api';
import { GLOBALS_UPDATED, SET_GLOBALS } from 'storybook/internal/core-events';
import { buildTheme } from './theme.mjs';

function colorSchemeFromQuery() {
  const globals = new URLSearchParams(window.location.search).get('globals') ?? '';
  return /(?:^|;)colorScheme:dark(?:;|$)/u.test(globals) ? 'dark' : 'light';
}

function applyColorScheme(value) {
  const colorScheme = value === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-muxui-color-scheme', colorScheme);
  addons.setConfig({ theme: buildTheme(colorScheme) });
}

// Apply the URL state before the manager renders, then keep the manager shell
// in sync with the existing preview colorScheme global toolbar.
applyColorScheme(colorSchemeFromQuery());

// Storybook's JSON editor hides its parse-error state inside an Emotion class.
// Expose the same blur-time validation for accessible, token-based error paint.
document.addEventListener('focusout', ({ target }) => {
  if (!(target instanceof HTMLTextAreaElement)
    || !target.matches('#storybook-panel-region textarea[placeholder="Edit JSON string..."]')) return;
  try {
    if (target.value) JSON.parse(target.value);
    target.removeAttribute('aria-invalid');
  } catch {
    target.setAttribute('aria-invalid', 'true');
  }
});

addons.ready().then((channel) => {
  channel.on(GLOBALS_UPDATED, ({ globals }) => applyColorScheme(globals?.colorScheme));
  channel.on(SET_GLOBALS, ({ globals }) => applyColorScheme(globals?.colorScheme));
});
