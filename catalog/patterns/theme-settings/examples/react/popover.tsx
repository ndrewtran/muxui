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

  // Random keeps its own label, and the value is the preset it rolled.
  const label = choice === 'random' ? 'Random theme' : 'Current theme';
  const value = theme?.name ?? 'Page default';

  return (
    <div className="theme-bar">
      <style>{`
        .theme-bar {
          display: flex;
          justify-content: flex-end;
          padding: var(--muxui-semantic-layout-inset-large) var(--muxui-semantic-layout-viewport-inset);
        }

        /* A round, bordered button that takes a translucent fill, so it reads on any theme, while hovered or the panel is open.
           Forced colours keep Button's own system-colour border and text. */
        .muxui-button.theme-trigger {
          border-radius: var(--muxui-semantic-shape-pill-radius);
        }

        @media (forced-colors: none) {
          .muxui-button.theme-trigger {
            outline-color: var(--muxui-semantic-field-border);
            color: var(--muxui-semantic-content-default);
          }

          .muxui-button.theme-trigger:is(:hover, [aria-expanded='true']):not([data-muxui-state-disabled]) {
            background-color: color-mix(in srgb, var(--muxui-semantic-surface-strong) 8%, transparent);
            color: var(--muxui-semantic-content-strong);
          }
        }

        .theme-trigger .muxui-icon-button__icon {
          inline-size: 1rem;
          block-size: 1rem;
        }

        /* The panel is a dark scope (colorScheme on the Popover), so its surface and text, and the pickers inside, are the dark
           ones. Popover does not cap its own height, so the panel scrolls inside the room the viewport leaves, as it is tall. */
        .muxui-popover.theme-popover {
          box-sizing: border-box;
          inline-size: min(23.25rem, calc(100vw - 1.5rem));
          max-inline-size: none;
          max-block-size: inherit;
          overflow-y: auto;
          padding: var(--muxui-semantic-layout-inset-medium);
          border-radius: var(--muxui-semantic-shape-feature-card-radius);
        }

        .theme-panel {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .theme-mode {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-tight-gap);
        }

        /* Small, uppercase and muted, as ThemePicker's group headings are. The label token is normal, so the tracking is set here. */
        .theme-heading {
          padding-inline: var(--muxui-semantic-layout-utility-inset);
          color: var(--muxui-semantic-content-muted);
          font-size: var(--muxui-semantic-typography-badge-size);
          line-height: 1;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .theme-foot {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-action-gap);
          padding-inline: var(--muxui-semantic-layout-utility-inset);
        }

        /* The rule is an hr, whose own margin the foot's gap replaces. */
        .muxui-separator.theme-rule {
          margin: 0;
          background-color: var(--muxui-semantic-border-faint);
        }

        .theme-current {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
        }
      `}</style>
      <Popover
        aria-label="Theme settings"
        className="theme-popover"
        colorScheme="dark"
        placement="bottom-end"
        trigger={<IconButton aria-label="Theme" className="theme-trigger" size="lg" variant="ghost"><Palette /></IconButton>}
      >
        <div className="theme-panel">
          <div className="theme-mode">
            <div className="theme-heading" aria-hidden="true">Mode</div>
            <ColorModePicker />
          </div>
          <ThemePicker random value={choice} onChange={choose} />
          <div className="theme-foot">
            <Separator className="theme-rule" />
            <div className="theme-current" role="status">
              <Text size="xs" color="muted">{label}</Text>
              <Text size="xs">{value}</Text>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}
