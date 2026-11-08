import { useEffect, useState } from 'react';
import { ColorModePicker, IconButton, Popover, Separator, Text, ThemePicker } from '@muxui/react';
import type { ThemePickerValue } from '@muxui/react';
import { MUXUI_DEFAULT_THEME_PRESET_ID, MUXUI_THEME_PRESETS, MUXUI_THEME_PRESETS_BY_ID } from '@muxui/react/themes';
import type { MuxUIThemeId } from '@muxui/react/themes';

const Palette = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="13.5" cy="6.5" r="1" />
    <circle cx="17.5" cy="10.5" r="1" />
    <circle cx="8.5" cy="7.5" r="1" />
    <circle cx="6.5" cy="12.5" r="1" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z" />
  </svg>
);

const randomPreset = (): MuxUIThemeId => MUXUI_THEME_PRESETS[Math.floor(Math.random() * MUXUI_THEME_PRESETS.length)]?.id ?? MUXUI_DEFAULT_THEME_PRESET_ID;

export function ThemeSettingsPopoverExample() {
  // Local state only. An app sets its saved or default preset on the document root before first paint, for example from
  // a script in the document head, and this block then reflects it. Random is rolled in that script too.
  const [choice, setChoice] = useState<ThemePickerValue>();
  // The theme this block applied. It stays unset until a theme is picked, so a theme the page already shows is not rewritten.
  const [applied, setApplied] = useState<MuxUIThemeId>();
  const shown = choice === 'random' ? applied : choice;
  const theme = shown === undefined ? undefined : MUXUI_THEME_PRESETS_BY_ID[shown];
  const choose = (next: ThemePickerValue) => {
    setChoice(next);
    setApplied(next === 'random' ? randomPreset() : next);
  };

  // After mount, select the preset the page already shows. Nothing is applied, and an absent or unknown theme selects nothing.
  useEffect(() => {
    const host = document.documentElement.getAttribute('data-muxui-theme');
    const preset = MUXUI_THEME_PRESETS.find(({ id }) => id === host);
    if (preset) setChoice(preset.id);
  }, []);

  // A picked theme goes on the document root beside the color scheme ColorModePicker writes there. The previous value
  // returns on unmount, so a host page is not left re-themed.
  useEffect(() => {
    if (applied === undefined) return undefined;
    const root = document.documentElement;
    const previous = root.getAttribute('data-muxui-theme');
    root.setAttribute('data-muxui-theme', applied);
    return () => {
      if (previous === null) root.removeAttribute('data-muxui-theme');
      else root.setAttribute('data-muxui-theme', previous);
    };
  }, [applied]);

  const title = theme === undefined ? 'Page theme' : choice === 'random' ? `Random: ${theme.name}` : theme.name;

  return (
    <div className="theme-bar">
      <style>{`
        .theme-bar {
          display: flex;
          justify-content: flex-end;
          padding: var(--muxui-semantic-layout-inset-large) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The popover's own surface is a strong one that the pickers' text does not read on, so it takes the raised
           surface other popups use. It scrolls inside the room the viewport leaves, as the panel is tall. */
        .theme-popover {
          box-sizing: border-box;
          max-block-size: inherit;
          overflow-y: auto;
          background-color: var(--muxui-semantic-surface-raised);
          border: 1px solid var(--muxui-semantic-border-popup);
          box-shadow: var(--muxui-semantic-elevation-overlay);
          color: var(--muxui-semantic-content-default);
        }

        .theme-panel {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-section-gap);
          inline-size: 18rem;
          max-inline-size: 100%;
        }
      `}</style>
      <Popover
        aria-label="Theme settings"
        className="theme-popover"
        placement="bottom-end"
        trigger={<IconButton aria-label="Theme" variant="neutral"><Palette /></IconButton>}
      >
        <div className="theme-panel">
          <ColorModePicker />
          <ThemePicker random value={choice} onChange={choose} />
          <Separator />
          <div role="status">
            <Text as="p" variant="label" size="sm">{title}</Text>
            <Text as="p" size="sm" color="muted">{theme?.description ?? 'No preset chosen.'}</Text>
          </div>
        </div>
      </Popover>
    </div>
  );
}
