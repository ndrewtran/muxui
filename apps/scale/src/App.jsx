import React from 'react';
import {
  Breadcrumbs,
  Button,
  Calendar,
  Checkbox,
  ColorArea,
  ColorModeToggle,
  ColorSlider,
  Dialog,
  Disclosure,
  FileTrigger,
  GridList,
  Link,
  Meter,
  Menu,
  NumberField,
  ProgressBar,
  RadioGroup,
  SearchField,
  Select,
  SelectNative,
  Slider,
  Separator,
  Switch,
  Table,
  Tabs,
  TagGroup,
  TextField,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from '@muxui/react';
import '@muxui/react/styles.css';
import {
  CONTRAST_METHODS,
  DEFAULT_SETTINGS,
  MONO_PRESETS,
  NAMED_STEPS,
  NEUTRAL_STEPS,
  RADIUS_SETTINGS,
  RADIUS_TOKENS,
  STANDARD_PRESETS,
  TYPOGRAPHY_ROLES,
  TYPOGRAPHY_TOKEN_DEFAULTS,
  createScaleDocument,
  draftScaleDocument,
  previewCss,
  previewTheme,
  previewSwatches,
  presetSettings,
  randomScaleSettings,
  radiusValue,
  rootCssFromPreview,
  serializeScaleDocument,
  settingsFromDocument,
  validateScaleDocument,
  validateScaleSettings,
} from './theme-contract.mjs';
import { applyTheme, getAppliedThemeStatus, getModePreferences, resetAppliedTheme, setModePreference, THEME_STATUS_EVENT } from './theme-controller.mjs';
import './styles.css';

const DRAFT_KEY = 'muxui-scale:draft:v1';
const PREFERENCES_KEY = 'muxui-scale:preferences:v1';

function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function withEmbeddedSiteMode(settings, embedded) {
  if (!embedded) return settings;
  const colorMode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  if (!settings.themeModes?.colorScheme?.includes(colorMode)) throw new Error(`Imported theme does not support the site's ${colorMode} color mode.`);
  return { ...settings, colorMode, background: colorMode };
}

function settingsForScope(settings, embedded) {
  return validateScaleSettings(withEmbeddedSiteMode(settings, embedded));
}

function readInitialSettings(embedded = false) {
  const hash = window.location.hash.replace(/^#/u, '');
  let preferences = {};
  try { preferences = JSON.parse(safeStorageGet(PREFERENCES_KEY) ?? '{}'); } catch { /* optional preference state */ }
  let error = null;
  for (const encoded of [hash, safeStorageGet(DRAFT_KEY)]) {
    if (!encoded) continue;
    try {
      const value = JSON.parse(hash === encoded ? decodeURIComponent(encoded) : encoded);
      return { settings: settingsForScope({ ...DEFAULT_SETTINGS, ...preferences, ...value }, embedded), error };
    } catch (cause) { error = `Saved settings rejected: ${cause.message}`; }
  }
  try {
    const settings = { ...DEFAULT_SETTINGS, ...preferences };
    settings.colorMode = settings.background === 'light' ? 'light' : 'dark';
    return { settings: settingsForScope(settings, embedded), error };
  } catch (cause) { return { settings: settingsForScope({ ...DEFAULT_SETTINGS }, embedded), error: `Saved preferences rejected: ${cause.message}` }; }
}

function writeDraft(settings) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(settings));
    window.history.replaceState(null, '', `#${encodeURIComponent(JSON.stringify(settings))}`);
  } catch { /* private browsing and restricted storage are still usable */ }
}

function writePreference(key, value) {
  try {
    const current = JSON.parse(safeStorageGet(PREFERENCES_KEY) ?? '{}');
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...current, [key]: value }));
  } catch { /* preferences are optional */ }
}

function normalizeHex(value) {
  const candidate = String(value).trim();
  return /^#[0-9a-f]{6}$/iu.test(candidate) ? candidate.toLowerCase() : null;
}

function colorStringToHex(value) {
  const normalized = normalizeHex(value);
  if (normalized) return normalized;
  const rgba = value.match(/^rgba?\(([^)]+)\)$/iu);
  if (rgba) {
    const channels = rgba[1].split(',').slice(0, 3).map((channel) => Number.parseFloat(channel.trim()));
    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
  }
  const hsl = value.match(/^hsla?\(([^)]+)\)$/iu);
  if (hsl) {
    const [hue, saturation, lightness] = hsl[1].split(',').slice(0, 3).map((channel) => Number.parseFloat(channel));
    if ([hue, saturation, lightness].every(Number.isFinite)) {
      const h = ((hue % 360) + 360) % 360 / 360;
      const s = saturation / 100;
      const l = lightness / 100;
      const chroma = (1 - Math.abs(2 * l - 1)) * s;
      const x = chroma * (1 - Math.abs((h * 6) % 2 - 1));
      const match = h < 1 / 6 ? [chroma, x, 0] : h < 2 / 6 ? [x, chroma, 0] : h < 3 / 6 ? [0, chroma, x] : h < 4 / 6 ? [0, x, chroma] : h < 5 / 6 ? [x, 0, chroma] : [chroma, 0, x];
      const m = l - chroma / 2;
      return `#${match.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return null;
}

function HeaderColorMode({ value, modes, onChange }) {
  return <ColorModeToggle aria-label="Preview dark mode" mode={value} storageKey="muxui-scale:color-mode:v1" disabled={!modes.includes(value === 'light' ? 'dark' : 'light')} onModeChange={(mode) => { onChange(mode); writePreference('background', mode); }} />;
}

function ScaleIcon({ name }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'colours' ? <><circle cx="9" cy="9" r="5" /><circle cx="15" cy="9" r="5" /><circle cx="12" cy="15" r="5" /></> : name === 'typography' ? <><path d="M4 5h16M12 5v15M8 20h8" /></> : <path d="M5 20V9a5 5 0 0 1 5-5h10M5 20h15V4" />}
  </svg>;
}

function PresetMenu({ family, settings, chromeAttributes, onSelect }) {
  const presets = family === 'standard' ? STANDARD_PRESETS : MONO_PRESETS;
  const current = presets.find(([id]) => settings.family === family && settings.presetId === id);
  const label = family === 'standard' ? 'Standard themes' : 'Monochrome themes';
  return <Menu.Root>
    <Menu.Trigger className={`preset-trigger preset-${family}`} aria-label={label}>{current?.[1] ?? (family === 'standard' ? 'Standard themes' : 'Monochrome')}<span aria-hidden="true">⌄</span></Menu.Trigger>
    <Menu.Popup className="scale-chrome scale-preset-popup" {...chromeAttributes}>
      <Menu.List aria-label={label}>
        {presets.map(([id, name, namedColor, neutralColor]) => <Menu.Item key={id} id={id} textValue={name} onAction={() => onSelect(family, id)}>
          <span className="preset-swatches" aria-hidden="true"><i style={{ background: namedColor }} /><i style={{ background: neutralColor ?? namedColor }} /></span>{name}
        </Menu.Item>)}
      </Menu.List>
    </Menu.Popup>
  </Menu.Root>;
}

function ModePreferences({ values, modes, onChange }) {
  return <div className="mode-preferences" aria-label="Site preferences">
    {[
      ['contrast', 'Contrast'],
      ['motion', 'Motion'],
      ['density', 'Density'],
    ].map(([axis, label]) => <label key={axis}>
      <span>{label}</span>
      <SelectNative size="sm" value={values[axis] ?? 'auto'} onChange={(event) => onChange(axis, event.target.value)} aria-label={`${label} preference`}>
        <option value="auto">Auto</option>
        {(modes[axis] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
      </SelectNative>
    </label>)}
  </div>;
}

function readRootModeSignature() {
  const root = document.documentElement;
  return [root.dataset.muxuiColorScheme, root.dataset.muxuiContrast, root.dataset.muxuiMotion, root.dataset.muxuiDensity, root.dataset.muxuiDirection].join('|');
}

function previewModesFor(settings, embedded) {
  if (!embedded) return { modes: { colorScheme: settings.colorMode }, unsupported: [] };
  const root = document.documentElement;
  const requested = {
    colorScheme: root.dataset.theme === 'dark' ? 'dark' : 'light',
    contrast: root.dataset.muxuiContrast ?? DEFAULT_SETTINGS.themeModes.contrast[0],
    motion: root.dataset.muxuiMotion ?? DEFAULT_SETTINGS.themeModes.motion[0],
    density: root.dataset.muxuiDensity ?? DEFAULT_SETTINGS.themeModes.density[0],
    direction: root.dataset.muxuiDirection ?? DEFAULT_SETTINGS.themeModes.direction[0],
  };
  const unsupported = Object.keys(requested).filter((axis) => !settings.themeModes[axis]?.includes(requested[axis]));
  const modes = Object.fromEntries(Object.entries(requested).map(([axis, value]) => [axis, settings.themeModes[axis].includes(value) ? value : settings.themeModes[axis][0]]));
  return { modes, unsupported };
}

function themeModeAttributes(compiled) {
  return Object.fromEntries(Object.entries(compiled.modes).map(([axis, value]) => [`data-muxui-${axis === 'colorScheme' ? 'color-scheme' : axis}`, value]));
}

function isEditorNavigation(target) {
  return target instanceof Element && Boolean(target.closest('.scale-rail'));
}

function HexColorInput({ label, value, onChange }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const normalized = normalizeHex(draft);
    if (normalized) { setDraft(normalized); onChange(normalized); }
    else setDraft(value);
  };
  return <label className="base-color-input">
    <span className="field-label">{label}</span>
    <span className="base-color-value">
      <span aria-hidden="true">#</span>
      <input aria-label={`${label} hex`} type="text" value={draft.replace(/^#/u, '')} maxLength={6} spellCheck="false" onChange={(event) => setDraft(`#${event.target.value.replace(/^#/u, '')}`)} onBlur={(event) => { if (!isEditorNavigation(event.relatedTarget)) commit(); }} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }} />
    </span>
  </label>;
}

function MainColorSelector({ label, value, onChange }) {
  const updateColor = (next) => {
    const hex = colorStringToHex(String(next));
    if (hex) onChange(hex);
  };
  return <div className="main-color-selector">
    <HexColorInput label={label} value={value} onChange={onChange} />
    <div className="color-picker-controls">
      <ColorArea value={value} xChannel="saturation" yChannel="lightness" colorSpace="hsl" aria-label={`${label} saturation and lightness`} onChange={updateColor} />
      <ColorSlider value={value} channel="hue" colorSpace="hsl" aria-label={`${label} hue`} onChange={updateColor} />
    </div>
  </div>;
}

// A shade with no computable score (translucent) has no badge.
function scoreText(label, badge) {
  return badge ? `${label} · ${badge}` : label;
}

function PaletteRow({ title, compiled, kind, steps, contrastPivot, contrastAlgorithm, onCopy }) {
  const [selectedStep, setSelectedStep] = React.useState(60);
  const palette = previewSwatches(compiled, kind, steps, { pivot: contrastPivot, algorithm: contrastAlgorithm });
  const selected = palette.find(({ step }) => step === selectedStep) ?? palette.find(({ step }) => step === 60) ?? palette[0];
  return <div className="palette-group">
    <div className="palette-row" role="group" aria-label={`${title} colour scale`}>
      {palette.map(({ step, value, background, foreground, label, badge }, index) => {
        // Auto reports compiled foreground changes; it has no single configured pivot.
        const boundary = contrastPivot === 'auto'
          ? index > 0 && foreground !== palette[index - 1].foreground
          : step >= contrastPivot && (index === 0 || palette[index - 1].step < contrastPivot);
        const markerLabel = boundary ? contrastPivot === 'auto' ? 'Automatic foreground boundary' : `Contrast pivot ${contrastPivot}` : '';
        return <button className="palette-swatch" key={step} type="button" aria-pressed={selected.step === step} title={`Copy ${title} ${step}, ${scoreText(label, badge)}${markerLabel ? `; ${markerLabel}` : ''}`} aria-label={`Copy ${title} ${step}, ${value}, ${[label.replace(/:1$/u, ' to 1'), badge].filter(Boolean).join(', ')}${markerLabel ? `, ${markerLabel}` : ''}`} onClick={() => { setSelectedStep(step); onCopy(value); }}><span className="palette-swatch-color" style={{ backgroundColor: background }} />{boundary ? <svg className="swatch-pivot" viewBox="0 0 12 10" aria-hidden="true"><path d="M1 1H11L6 9Z" /></svg> : null}<span className="swatch-shade">{step}</span></button>;
      })}
    </div>
    <dl className="palette-details"><div><dt>{title} {selected.step}</dt><dd>{selected.value}</dd></div></dl>
    <ul className="contrast-methods" aria-label={`Text on ${title} ${selected.step}`}>
      {selected.methods.map(({ algorithm, name, text, label, badge }) => <li key={algorithm} data-active={algorithm === contrastAlgorithm ? 'true' : undefined} aria-current={algorithm === contrastAlgorithm ? 'true' : undefined}>
        <span className="contrast-method-name">{name}</span>
        <span className="contrast-chip" style={text ? { color: text, backgroundColor: selected.background } : { visibility: 'hidden' }} aria-hidden="true">Aa</span>
        <span className="contrast-method-text">{text}</span>
        <span className="contrast-method-score">{scoreText(label, badge)}</span>
      </li>)}
    </ul>
  </div>;
}

function ContrastMethodSelector({ value, onChange }) {
  return <div className="method-selector"><span>Contrast method</span><ToggleButtonGroup aria-label="Contrast method" selectionMode="single" selectedIds={[value]} disallowEmptySelection onSelectionChange={([next]) => onChange(next)}>{CONTRAST_METHODS.map(([id, name]) => <ToggleButton key={id} id={id} size="sm">{name}</ToggleButton>)}</ToggleButtonGroup></div>;
}

function PivotSelector({ value, onChange }) {
  return <label className="pivot-selector"><span>Contrast pivot</span><SelectNative aria-label="Contrast pivot" size="sm" value={String(value)} onChange={(event) => onChange(event.target.value === 'auto' ? 'auto' : Number(event.target.value))}>
    <option value="auto">Auto</option>{NAMED_STEPS.map((step) => <option key={step} value={step}>{step}</option>)}
  </SelectNative></label>;
}

const TYPOGRAPHY_METRIC_FIELDS = Object.freeze([
  { key: 'fontWeight', label: 'Weight', min: 100, max: 900, step: 1, inputMode: 'numeric' },
  { key: 'lineHeight', label: 'Leading', min: 0.75, max: 3, step: 0.05, inputMode: 'decimal' },
  { key: 'letterSpacing', label: 'Tracking', inputMode: 'decimal' },
]);
const TYPOGRAPHY_METRIC_BY_KEY = Object.freeze(Object.fromEntries(TYPOGRAPHY_METRIC_FIELDS.map((field) => [field.key, field])));
const TRACKING_VALUE = /^(?:normal|[+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:em|rem|px))$/u;

function cssVariableName(tokenId) {
  return `--muxui-${tokenId.replaceAll('.', '-')}`;
}

function typographyTokenValue(settings, tokenId) {
  return settings.additionalOverrides?.[tokenId]?.value ?? TYPOGRAPHY_TOKEN_DEFAULTS[tokenId].value;
}

function typographyTokenIsOverridden(settings, tokenId) {
  return Object.hasOwn(settings.additionalOverrides ?? {}, tokenId);
}

function typographyMetricTokenId(role, key) {
  return role.metrics[key];
}

function typographyMetricValue(settings, role, key) {
  return typographyTokenValue(settings, typographyMetricTokenId(role, key));
}

function formatTypographyValue(tokenId, value) {
  const token = TYPOGRAPHY_TOKEN_DEFAULTS[tokenId];
  if (token.type === 'dimension') return `${value}${token.unit}`;
  return String(value);
}

function parseTypographyMetric(key, raw) {
  const field = TYPOGRAPHY_METRIC_BY_KEY[key];
  const candidate = String(raw).trim();
  if (!candidate) throw new TypeError(`${field.label} must have a value.`);
  if (key === 'letterSpacing') {
    if (!TRACKING_VALUE.test(candidate)) throw new TypeError('Tracking must be normal or a finite CSS length such as 0.02em.');
    if (candidate !== 'normal') {
      const match = candidate.match(/^([+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)))(em|rem|px)$/u);
      const value = Number(match?.[1]);
      const unit = match?.[2];
      const maximum = unit === 'px' ? 32 : 2;
      if (!Number.isFinite(value) || Math.abs(value) > maximum) throw new TypeError(`Tracking must stay between -${maximum}${unit} and ${maximum}${unit}.`);
    }
    return candidate;
  }
  const value = Number(candidate);
  if (!Number.isFinite(value) || value < field.min || value > field.max) throw new TypeError(`${field.label} must be between ${field.min} and ${field.max}.`);
  if (key === 'fontWeight' && !Number.isInteger(value)) throw new TypeError('Weight must be a whole number between 100 and 900.');
  return key === 'fontWeight' ? value : Number(value.toFixed(2));
}

function typographyOverride(tokenId, value) {
  const token = TYPOGRAPHY_TOKEN_DEFAULTS[tokenId];
  return { type: token.type, unit: token.unit, value };
}

function TypographyMetricInput({ field, value, mixed = false, disabled = false, ariaLabel, id, onCommit }) {
  const [draft, setDraft] = React.useState(value === null || value === undefined ? '' : String(value));
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    setDraft(mixed ? '' : value === null || value === undefined ? '' : String(value));
    setDirty(false);
  }, [mixed, value]);
  const commit = () => { if (dirty) onCommit(draft); };
  return <input
    className="typography-metric-input"
    type={field.key === 'letterSpacing' ? 'text' : 'number'}
    inputMode={field.inputMode}
    id={id}
    min={field.min}
    max={field.max}
    step={field.step}
    aria-label={ariaLabel}
    value={draft}
    placeholder={mixed ? 'Mixed' : undefined}
    disabled={disabled}
    onChange={(event) => { setDraft(event.target.value); setDirty(true); }}
    onBlur={(event) => { if (!isEditorNavigation(event.relatedTarget)) commit(); }}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
  />;
}

function TypographySpecimens({ settings, previewAvailable = true }) {
  if (!previewAvailable) return <section className="typography-specimens typography-specimens-unavailable" aria-labelledby="typography-specimens-title">
    <div className="typography-panel-heading">
      <div>
        <h3 id="typography-specimens-title">Live specimens unavailable</h3>
        <p>The draft preview does not support the site&apos;s requested modes.</p>
      </div>
    </div>
  </section>;
  return <section className="typography-specimens" aria-labelledby="typography-specimens-title">
    <div className="typography-panel-heading">
      <div>
        <h3 id="typography-specimens-title">Live specimens</h3>
        <p>Each sample reads from the same compiled role metrics as the preview.</p>
      </div>
      <span className="typography-panel-note">m variants · canonical sizes</span>
    </div>
    <div className="typography-specimen-grid">
      {TYPOGRAPHY_ROLES.map((role) => {
        const variant = role.variants.find(({ name }) => name === role.representativeVariant) ?? role.variants[0];
        const style = {
          color: `var(${cssVariableName(role.color)})`,
          fontFamily: `var(${cssVariableName(role.family)})`,
          fontSize: `var(${cssVariableName(variant.fontSize)})`,
          fontWeight: `var(${cssVariableName(variant.fontWeight)})`,
          lineHeight: `var(${cssVariableName(variant.lineHeight)})`,
          letterSpacing: `var(${cssVariableName(variant.letterSpacing)})`,
        };
        const linked = role.id === 'expressive';
        return <article className="typography-specimen" key={role.id} data-role={role.id}>
          <div className="typography-specimen-heading"><strong>{role.id}</strong><span>{role.representativeVariant} · {role.metricGroup}{linked ? ' · linked' : ''}</span></div>
          <p style={style}>Design decisions should be felt in the interface.</p>
        </article>;
      })}
    </div>
  </section>;
}

function TypographyMatrix({ settings, onOverridesChange, onError }) {
  const [selectedIds, setSelectedIds] = React.useState(() => TYPOGRAPHY_ROLES.slice(0, 3).map(({ id }) => id));
  const selectedRoles = TYPOGRAPHY_ROLES.filter(({ id }) => selectedIds.includes(id));
  const sharedTextMetricsSelected = selectedRoles.some(({ id, metricGroup }) => id === 'expressive' || metricGroup === 'text');

  const bulkValue = (key) => {
    const tokenIds = [...new Set(selectedRoles.map((role) => typographyMetricTokenId(role, key)))];
    if (!tokenIds.length) return null;
    const values = tokenIds.map((tokenId) => typographyTokenValue(settings, tokenId));
    return values.every((value) => Object.is(value, values[0])) ? values[0] : null;
  };

  const commitMetric = (roles, key, raw) => {
    try {
      const tokenIds = [...new Set(roles.map((role) => typographyMetricTokenId(role, key)))];
      const value = parseTypographyMetric(key, raw);
      const nextOverrides = { ...(settings.additionalOverrides ?? {}) };
      tokenIds.forEach((tokenId) => { nextOverrides[tokenId] = typographyOverride(tokenId, value); });
      onOverridesChange(nextOverrides, `${TYPOGRAPHY_METRIC_BY_KEY[key].label} updated for ${roles.length} selected role${roles.length === 1 ? '' : 's'}.`);
    } catch (error) {
      onError(error.message);
    }
  };

  const resetRole = (role) => {
    if (role.id === 'expressive') return;
    const nextOverrides = { ...(settings.additionalOverrides ?? {}) };
    Object.values(role.metrics).forEach((tokenId) => delete nextOverrides[tokenId]);
    onOverridesChange(nextOverrides, `${role.id} restored to canonical defaults.`);
  };

  const roleState = (role) => {
    if (role.id === 'expressive') return 'linked';
    return Object.values(role.metrics).some((tokenId) => typographyTokenIsOverridden(settings, tokenId)) ? 'custom' : 'default';
  };

  return <section className="typography-editor" aria-labelledby="typography-editor-title">
    <h2 id="typography-editor-title">Typography</h2><p className="inspector-description">Shared roles across all components</p>
    <div className="typography-matrix-layout">
      <aside className="typography-selection" aria-label="Typography role selection">
        <div className="typography-selection-heading"><h3>Roles</h3><span>{selectedIds.length} selected</span><Button variant="ghost" size="sm" onActivate={() => setSelectedIds([])} disabled={!selectedIds.length}>Clear</Button></div>
        <div className="typography-selection-list">
          {TYPOGRAPHY_ROLES.map((role) => <Checkbox className={`typography-selection-row${selectedIds.includes(role.id) ? ' is-selected' : ''}`} key={role.id} checked={selectedIds.includes(role.id)} aria-label={`Select ${role.id} role`} onChange={(checked) => setSelectedIds((current) => checked ? [...current, role.id] : current.filter((id) => id !== role.id))}>
            <span className="typography-selection-name">{role.id}</span>
            </Checkbox>)}
        </div>
      </aside>
      <div className="typography-workspace">
        <div className="typography-bulk-panel">
          <div className="typography-bulk-heading"><strong>{selectedRoles.length ? `Edit ${selectedRoles.length} roles` : 'Select at least one role'}</strong></div>
          <div className="typography-bulk-controls">
            {TYPOGRAPHY_METRIC_FIELDS.map((field) => {
              const value = bulkValue(field.key);
              return <div className="typography-bulk-control" key={field.key}>
                <label className="typography-control-label" htmlFor={`typography-bulk-${field.key}`}>{field.label}{sharedTextMetricsSelected ? <span>Body + expressive share text metrics</span> : null}</label>
                <TypographyMetricInput id={`typography-bulk-${field.key}`} field={field} value={value} mixed={selectedRoles.length > 0 && value === null} disabled={!selectedRoles.length} ariaLabel={`Bulk ${field.label.toLowerCase()}`} onCommit={(raw) => commitMetric(selectedRoles, field.key, raw)} />
              </div>;
            })}
          </div>
        </div>
        <Disclosure title="Individual role metrics" className="individual-metrics"><div className="typography-table-scroll">
          <div className="typography-matrix-table" role="table" aria-label="Typography role matrix">
            <div className="typography-matrix-row typography-matrix-head" role="row">
              <span role="columnheader">Role</span><span role="columnheader">Size</span>{TYPOGRAPHY_METRIC_FIELDS.map((field) => <span role="columnheader" key={field.key}>{field.label}</span>)}<span role="columnheader">State</span>
            </div>
            {TYPOGRAPHY_ROLES.map((role) => {
              const linked = role.id === 'expressive';
              const state = roleState(role);
              const variant = role.variants.find(({ name }) => name === role.representativeVariant) ?? role.variants[0];
              return <div className={`typography-matrix-row${selectedIds.includes(role.id) ? ' is-selected' : ''}`} data-role={role.id} role="row" key={role.id}>
                <div className="typography-role-cell" role="rowheader"><strong>{role.id}</strong><span>{role.metricGroup}{linked ? ' · body metrics' : ''}</span></div>
                <span className="typography-size-cell" role="cell"><strong>{formatTypographyValue(variant.fontSize, typographyTokenValue(settings, variant.fontSize))}</strong><small>{role.representativeVariant}</small></span>
                {TYPOGRAPHY_METRIC_FIELDS.map((field) => {
                  const tokenId = typographyMetricTokenId(role, field.key);
                  const value = typographyMetricValue(settings, role, field.key);
                  return <span className={`typography-metric-cell${linked ? ' is-linked' : ''}`} role="cell" key={field.key}>
                    {linked ? <><span className="typography-metric-label">{field.label}</span><span className="typography-linked-value" aria-label={`${role.id} ${field.label.toLowerCase()} linked to body`}>{formatTypographyValue(tokenId, value)}</span></> : <label className="typography-role-metric" htmlFor={`typography-${role.id}-${field.key}`}><span className="typography-metric-label">{field.label}</span><TypographyMetricInput id={`typography-${role.id}-${field.key}`} field={field} value={value} ariaLabel={`${role.id} ${field.label.toLowerCase()}`} onCommit={(raw) => commitMetric([role], field.key, raw)} /></label>}
                  </span>;
                })}
                <span className={`typography-state typography-state-${state}`} role="cell">
                  <span>{state}</span>
                  {linked ? <small>text group</small> : <button type="button" className="quiet-button" onClick={() => resetRole(role)} disabled={state === 'default'}>{state === 'default' ? 'Reset' : 'Reset role'}</button>}
                </span>
              </div>;
            })}
          </div>
        </div>
        </Disclosure><p className="typography-matrix-note"><strong>Linked metrics</strong> Expressive keeps its own family and reads the body/text size, weight, leading, and tracking tokens.</p>
      </div>
    </div>

  </section>;
}

function ComponentPreview({ compiled }) {
  return <section className="component-preview" aria-label="Component Preview">
    <div className="preview-canvas">
      <div className="preview-top-row"><div className="preview-group preview-actions">
        <Button variant="primary" size="sm" onActivate={() => {}}>Primary</Button><Button variant="neutral" size="sm" onActivate={() => {}}>Neutral</Button><Button variant="ghost" size="sm" onActivate={() => {}}>Ghost</Button><ToggleButton size="sm" defaultSelected>Toggle</ToggleButton>
        <ToggleButtonGroup aria-label="Preview alignment" defaultSelectedIds={['center']} selectionMode="single"><ToggleButton id="left" size="sm">Left</ToggleButton><ToggleButton id="center" size="sm">Center</ToggleButton><ToggleButton id="right" size="sm">Right</ToggleButton></ToggleButtonGroup>
      </div><div className="preview-choice-row"><Checkbox defaultChecked>Include dark mode</Checkbox><Switch label="Accent" defaultSelected /></div></div>
      <div className="preview-grid preview-primary-grid">
        <div className="preview-block"><TextField aria-label="Preview theme name" placeholder="Theme name" /><SearchField aria-label="Preview search" placeholder="Search…" /><NumberField aria-label="Preview quantity" defaultValue={5} minValue={0} maxValue={100} /></div>
        <div className="preview-block"><RadioGroup aria-label="Preview choices" defaultValue="b" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} /><Select.Root aria-label="Preview fruit" placeholder="Choose…"><Select.Trigger><Select.Value /></Select.Trigger><Select.Popup className="muxui-scale-preview" {...themeModeAttributes(compiled)}><Select.List items={['Apple', 'Banana', 'Cherry']} /></Select.Popup></Select.Root></div>
        <div className="preview-block"><Tabs aria-label="Preview sections" defaultValue="overview" items={[{ id: 'overview', label: 'Overview' }, { id: 'details', label: 'Details' }, { id: 'settings', label: 'Settings' }]} /><Disclosure title="Show details" defaultExpanded>Additional details revealed on expand.</Disclosure><TagGroup aria-label="Preview tags" items={['Design', 'Development', 'Docs']} /></div>
        <div className="preview-block"><Calendar aria-label="Preview calendar" /></div>
      </div>
      <Table aria-label="Preview people" columns={[{ id: 'name', label: 'Name', isRowHeader: true }, { id: 'role', label: 'Role' }, { id: 'status', label: 'Status' }]} rows={[{ id: 'r1', values: { name: 'Alice', role: 'Engineer', status: 'Active' } }, { id: 'r2', values: { name: 'Bob', role: 'Designer', status: 'Active' } }]} />
      <div className="preview-grid preview-extra-grid"><div className="preview-block"><span className="preview-label">Progress and meter</span><ProgressBar label="Contrast target" value={68} /><Meter label="Storage" value={40} /></div><div className="preview-block"><span className="preview-label">Grid list</span><GridList aria-label="Preview items" items={['Design tokens', 'Components', 'Documentation']} defaultSelectedIds={['Components']} selectionMode="multiple" /></div><div className="preview-block"><span className="preview-label">Menu and tooltip</span><Menu aria-label="Preview menu" items={['Edit', 'Duplicate', 'Delete']} /><Tooltip className="muxui-scale-preview" {...themeModeAttributes(compiled)} content="Tooltip content" trigger={<Button variant="neutral" size="sm">Hover me</Button>} /></div></div>
      <div className="preview-footer"><Breadcrumbs aria-label="Preview breadcrumbs" items={[{ id: 'home', label: 'Home', href: '#' }, { id: 'library', label: 'Library', href: '#' }, { id: 'current', label: 'Current' }]} /><Separator /><Link href="#" onActivate={() => {}}>Learn more</Link></div>
    </div>
  </section>;
}

export default function App({ embedded = false, loadTheme = null, saveTheme = null } = {}) {
  const [initial] = React.useState(() => readInitialSettings(embedded));
  const [settings, setSettings] = React.useState(initial.settings);
  const [slug, setSlug] = React.useState('my-mux-theme');
  const [revision, setRevision] = React.useState(null);
  const [status, setStatus] = React.useState({ tone: initial.error ? 'error' : 'idle', text: initial.error ?? (embedded ? 'Draft changes stay here until you apply them.' : 'Draft changes stay in this browser until you save them.') });
  const [appliedTheme, setAppliedTheme] = React.useState(() => embedded ? getAppliedThemeStatus().theme : null);
  const [appliedError, setAppliedError] = React.useState(() => embedded ? getAppliedThemeStatus().error : null);
  const [mode, setMode] = React.useState('named');
  // Editor navigation never enters the persisted theme document. Hidden panels keep pending edits.
  const [section, setSection] = React.useState('colours');
  const [previewTab, setPreviewTab] = React.useState('components');
  const [mobileView, setMobileView] = React.useState('editor');
  const [exportOpen, setExportOpen] = React.useState(false);
  const [siteColorMode, setSiteColorMode] = React.useState(() => embedded && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [modePreferences, setModePreferences] = React.useState(() => embedded ? getModePreferences() : {});
  const [rootModeSignature, setRootModeSignature] = React.useState(readRootModeSignature);

  React.useEffect(() => { writeDraft(settings); }, [settings]);
  React.useEffect(() => {
    if (!embedded) return undefined;
    const onThemeStatus = (event) => {
      const detail = event.detail ?? {};
      if (detail.kind === 'applied' || detail.kind === 'restored') {
        setAppliedTheme(detail.theme);
        setAppliedError(null);
        if (detail.kind === 'restored' && detail.unsupportedModes?.length) {
          setStatus({ tone: 'error', text: `Saved theme uses fallback modes: ${detail.unsupportedModes.join(', ')}.` });
        }
        setRootModeSignature(readRootModeSignature());
      } else if (detail.kind === 'reset') {
        setAppliedTheme(null);
        setAppliedError(null);
        setStatus({ tone: 'idle', text: embedded ? 'Draft changes stay here until you apply them.' : 'Draft changes stay in this browser until you save them.' });
        setRootModeSignature(readRootModeSignature());
      } else if (detail.kind === 'error') {
        setAppliedTheme(null);
        setAppliedError(detail.error);
        setStatus({ tone: 'error', text: detail.error });
        setRootModeSignature(readRootModeSignature());
      } else if (detail.kind === 'preferences') {
        setModePreferences(detail.preferences ?? {});
        setRootModeSignature(readRootModeSignature());
      }
    };
    window.addEventListener(THEME_STATUS_EVENT, onThemeStatus);
    return () => window.removeEventListener(THEME_STATUS_EVENT, onThemeStatus);
  }, [embedded]);
  React.useEffect(() => {
    if (!embedded) return undefined;
    const root = document.documentElement;
    const updateSiteMode = () => {
      const next = root.dataset.theme === 'dark' ? 'dark' : 'light';
      setSiteColorMode(next);
      setSettings((current) => {
        if (!current.themeModes.colorScheme.includes(next)) {
          setStatus({ tone: 'error', text: `Draft does not include the site's ${next} color mode.` });
          return current;
        }
        return { ...current, colorMode: next, background: next };
      });
    };
    updateSiteMode();
    const observer = new MutationObserver(updateSiteMode);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [embedded]);
  const update = React.useCallback((patch) => {
    try { setSettings(validateScaleSettings({ ...settings, ...patch })); }
    catch (error) { setStatus({ tone: 'error', text: error.message }); }
  }, [settings]);
  const updateTypographyOverrides = React.useCallback((additionalOverrides, message) => {
    try {
      setSettings(validateScaleSettings({ ...settings, additionalOverrides }));
      setStatus({ tone: 'success', text: message });
    } catch (error) {
      setStatus({ tone: 'error', text: error.message });
    }
  }, [settings]);
  const applyPreset = (family, id) => update(presetSettings(family, id));
  const randomize = (both) => {
    try {
      const next = randomScaleSettings(settings, { kind: both ? 'both' : mode });
      setSettings(next);
      setStatus({ tone: 'success', text: both ? 'Generated WCAG-safe named and neutral colours.' : 'Generated a WCAG-safe base colour.' });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setStatus({ tone: 'success', text: 'Copied to clipboard.' }); }
    catch { setStatus({ tone: 'error', text: 'Clipboard access is unavailable in this browser.' }); }
  };
  const save = async () => {
    if (!saveTheme) return;
    try {
      const document = createScaleDocument(settings, { slug });
      const expectedRevision = revision?.slug === slug ? revision.value : null;
      const result = await saveTheme(document, { slug, revision: expectedRevision });
      setRevision({ slug, value: result.revision }); setStatus({ tone: 'success', text: `Saved ${slug}.` });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const load = async () => {
    if (!loadTheme) return;
    try {
      const result = await loadTheme(slug);
      validateScaleDocument(result.theme); setSettings(settingsForScope(settingsFromDocument(result.theme), embedded)); setRevision({ slug, value: result.revision });
      setStatus({ tone: 'success', text: `Loaded ${slug}.` });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const exportJson = () => {
    try {
      const source = createScaleDocument(settings, { slug }); const blob = new Blob([`${JSON.stringify(source, null, 2)}\n`], { type: 'application/json' });
      const link = window.document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${slug}.json`; link.click(); URL.revokeObjectURL(link.href); setStatus({ tone: 'success', text: 'Exported a validated theme source.' });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const importJson = async (files) => {
    const file = files[0]; if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('Theme files must be no larger than 256 KiB.');
      const document = JSON.parse(await file.text()); validateScaleDocument(document); const nextSettings = settingsForScope(settingsFromDocument(document), embedded); setSettings(nextSettings);
      setSlug(document.id.slice('muxui:theme:'.length)); setRevision(null); setStatus({ tone: 'success', text: embedded ? 'Imported and validated theme source. Apply to site when ready.' : 'Imported and validated theme source. Save to persist it.' });
    } catch (error) { setStatus({ tone: 'error', text: `${embedded ? 'Import unavailable for this site' : 'Import rejected'}: ${error.message}` }); }
  };

  // Only the embedded Apply flow reads the draft document and its signature.
  const draftDocument = React.useMemo(() => {
    if (!embedded) return null;
    try { return draftScaleDocument(settings, slug); }
    catch { return null; }
  }, [embedded, settings, slug]);
  const draftSignature = React.useMemo(() => draftDocument ? serializeScaleDocument(draftDocument) : null, [draftDocument]);
  const appliedSignature = React.useMemo(() => {
    if (!appliedTheme) return null;
    try { return serializeScaleDocument(appliedTheme); }
    catch { return null; }
  }, [appliedTheme]);
  const hasUnappliedChanges = embedded && draftSignature !== appliedSignature;
  const apply = () => {
    try {
      if (!draftDocument) throw new Error('The current draft is invalid.');
      const result = applyTheme(draftDocument);
      setAppliedTheme(draftDocument);
      setAppliedError(null);
      const fallback = result.unsupportedModes?.length ? ` Fallback modes: ${result.unsupportedModes.join(', ')}.` : '';
      setStatus({ tone: result.persisted ? 'success' : 'error', text: `${result.persisted ? 'Applied theme to this site.' : 'Applied on this page only; browser storage is unavailable.'}${fallback}` });
    } catch (error) { setStatus({ tone: 'error', text: `Theme was not applied: ${error.message}` }); }
  };
  const resetApplied = () => {
    try {
      const result = resetAppliedTheme();
      setAppliedTheme(null);
      setAppliedError(null);
      setStatus({ tone: result.persisted ? 'success' : 'error', text: result.persisted ? 'Site theme reset to defaults. Draft remains available.' : 'Site theme reset on this page only; browser storage is unavailable.' });
    } catch (error) { setStatus({ tone: 'error', text: `Theme reset failed: ${error.message}` }); }
  };
  const updateModePreference = (axis, value) => {
    try {
      const result = setModePreference(axis, value);
      setModePreferences(result.preferences);
      if (!result.persisted) setStatus({ tone: 'error', text: 'Preference is active on this page only; browser storage is unavailable.' });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };

  const previewState = React.useMemo(() => {
    const preview = previewModesFor(settings, embedded);
    return { compiled: previewTheme(settings, preview), unsupported: preview.unsupported };
  }, [settings, embedded, rootModeSignature]);
  const compiled = previewState.compiled;
  React.useEffect(() => {
    if (embedded && previewState.unsupported.length) setStatus({ tone: 'error', text: `Draft preview unavailable for requested modes: ${previewState.unsupported.join(', ')}.` });
  }, [embedded, previewState.unsupported.join('|')]);
  // Standalone previews compile the copyable CSS modes, so only the selector differs.
  // Embedded previews follow the site's mode axes and compile the copy separately.
  const css = React.useMemo(() => embedded ? previewCss(settings, { selector: ':root' }) : rootCssFromPreview(compiled.css), [embedded, settings, compiled.css]);
  React.useLayoutEffect(() => {
    if (embedded) return undefined;
    // Overlay portals live outside the app element and need the same theme scope.
    const root = document.documentElement;
    const hadScope = root.classList.contains('muxui-scale-preview');
    const attributes = {
      'data-muxui-color-scheme': compiled.modes.colorScheme,
      'data-muxui-contrast': compiled.modes.contrast,
      'data-muxui-motion': compiled.modes.motion,
      'data-muxui-density': compiled.modes.density,
      'data-muxui-direction': compiled.modes.direction,
    };
    const previous = Object.fromEntries(Object.keys(attributes).map((name) => [name, root.getAttribute(name)]));
    root.classList.add('muxui-scale-preview');
    for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
    return () => {
      if (!hadScope) root.classList.remove('muxui-scale-preview');
      for (const [name, value] of Object.entries(previous)) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    };
  }, [embedded, compiled.modes.colorScheme, compiled.modes.contrast, compiled.modes.motion, compiled.modes.density, compiled.modes.direction]);
  const activeColor = mode === 'named' || settings.family === 'mono' ? settings.namedColor : settings.neutralColor;
  const updateColor = (color) => update(settings.family === 'mono' ? { namedColor: color, neutralColor: color, presetId: 'custom' } : mode === 'named' ? { namedColor: color, presetId: 'custom' } : { neutralColor: color, presetId: 'custom' });
  const reset = () => { setSettings(settingsForScope({ ...DEFAULT_SETTINGS }, embedded)); setStatus({ tone: 'idle', text: 'Draft reset.' }); };

  const previewUnavailable = embedded && previewState.unsupported.length > 0;
  const chromeMotion = embedded ? document.documentElement.dataset.muxuiMotion ?? compiled.modes.motion : compiled.modes.motion;
  const chrome = React.useMemo(() => previewTheme({ ...DEFAULT_SETTINGS, family: 'mono', presetId: 'custom', namedColor: '#000000', neutralColor: '#000000', whiteAnchor: true, colorMode: settings.colorMode }, { selector: '.scale-chrome', modes: { colorScheme: settings.colorMode, motion: chromeMotion } }), [settings.colorMode, chromeMotion]);
  const chromeAttributes = {
    'data-muxui-color-scheme': settings.colorMode,
    'data-muxui-contrast': compiled.modes.contrast,
    'data-muxui-motion': chromeMotion,
    'data-muxui-density': compiled.modes.density,
    'data-muxui-direction': compiled.modes.direction,
  };
  const presetName = [...STANDARD_PRESETS, ...MONO_PRESETS].find(([id]) => id === settings.presetId)?.[1] ?? 'Custom';
  const selectSection = (next) => { setSection(next); setPreviewTab(next === 'typography' ? 'typography' : 'components'); };
  const AppRoot = embedded ? 'div' : 'main';
  return <AppRoot aria-labelledby={embedded ? undefined : 'theme-playground-title'} className={`scale-app muxui-scale-preview${embedded ? ' is-embedded' : ''}`} data-mobile-view={mobileView} data-preview-background={settings.background} {...(previewUnavailable ? {} : { 'data-muxui-color-scheme': compiled.modes.colorScheme, 'data-muxui-contrast': compiled.modes.contrast, 'data-muxui-motion': compiled.modes.motion, 'data-muxui-density': compiled.modes.density, 'data-muxui-direction': compiled.modes.direction })}>
    {previewUnavailable ? null : <style data-muxui-scale-theme>{compiled.css}</style>}
    <style data-scale-chrome-theme>{chrome.css}</style>
    <header className="scale-header scale-chrome" {...chromeAttributes}>
      {embedded ? <h2 id="theme-playground-title">Scale</h2> : <h1 id="theme-playground-title">Scale</h1>}
      <div className="preset-controls"><PresetMenu family="standard" settings={settings} chromeAttributes={chromeAttributes} onSelect={applyPreset} /><PresetMenu family="mono" settings={settings} chromeAttributes={chromeAttributes} onSelect={applyPreset} /></div>
      <div className="header-actions">{embedded ? <><span className={`draft-state${hasUnappliedChanges ? ' draft-state-unapplied' : ''}`}>{hasUnappliedChanges ? 'Draft only' : 'Applied'}</span><Button size="sm" onActivate={apply} disabled={!hasUnappliedChanges}>Apply to site</Button><Button variant="ghost" size="sm" onActivate={resetApplied}>Reset applied</Button></> : <HeaderColorMode modes={settings.themeModes.colorScheme} value={settings.colorMode} onChange={(colorMode) => update({ background: colorMode, colorMode })} />}
        <Dialog title="Export theme" open={exportOpen} onOpenChange={setExportOpen} className="scale-chrome scale-export-dialog" panelClassName="scale-export-panel" {...chromeAttributes} trigger={<Button variant="neutral" size="sm">Export <span aria-hidden="true">⌄</span></Button>}>
          <div className="export-layout"><div className="output-heading"><h3 id="css-tokens-title">CSS tokens</h3><Button variant="neutral" size="sm" onActivate={() => copy(css)}>Copy CSS</Button></div><p className="export-note">CSS uses the current preview mode. JSON preserves every represented mode.</p><pre className="css-output" aria-label="Generated CSS"><code>{css}</code></pre>
            <TextField label="Theme slug" value={slug} onChange={setSlug} inputProps={{ pattern: '[a-z0-9]+(?:-[a-z0-9]+)*' }} />
            <div className="source-controls"><Button variant="neutral" size="sm" onActivate={exportJson}>Export JSON</Button><FileTrigger acceptedFileTypes={['application/json']} onSelect={importJson}><Button variant="neutral" size="sm">Import JSON</Button></FileTrigger>{!embedded ? <><Button variant="neutral" size="sm" onActivate={save} disabled={!saveTheme}>Save</Button><Button variant="neutral" size="sm" onActivate={load} disabled={!loadTheme}>Load</Button></> : null}<Button variant="neutral" size="sm" onActivate={() => copy(window.location.href)}>Share URL</Button><Button variant="ghost" size="sm" onActivate={reset}>{embedded ? 'Reset draft' : 'Reset to defaults'}</Button></div>
            {embedded ? <><span className="site-mode">Site follows {siteColorMode}</span><ModePreferences values={modePreferences} modes={settings.themeModes} onChange={updateModePreference} /></> : <SelectNative label="Preview canvas" size="sm" value={settings.background} onChange={(event) => update({ background: event.target.value, colorMode: event.target.value === 'light' ? 'light' : 'dark' })}>{['light', 'dark', 'accent'].map((value) => <option key={value} value={value} disabled={!settings.themeModes.colorScheme.includes(value === 'light' ? 'light' : 'dark')}>{value}</option>)}</SelectNative>}
            <p className={`status status-${status.tone}`} role="status">{status.text}</p>
          </div>
        </Dialog>
      </div>
    </header>
    <div className="mobile-switch scale-chrome" {...chromeAttributes}><ToggleButtonGroup aria-label="Workbench view" selectedIds={[mobileView]} disallowEmptySelection onSelectionChange={([next]) => setMobileView(next)}><ToggleButton id="editor" size="sm">Editor</ToggleButton><ToggleButton id="preview" size="sm">Preview</ToggleButton></ToggleButtonGroup></div>
    <div className="workbench">
      <nav className="scale-rail scale-chrome" {...chromeAttributes} aria-label="Theme editors" style={{ '--scale-rail-index': ['colours', 'typography', 'radius'].indexOf(section) }}>
        <div className="rail-options">
          {['colours', 'typography', 'radius'].map((id) => <Button key={id} className="rail-button" variant="ghost" size="sm" aria-pressed={section === id} aria-label={`${id === 'colours' ? 'Colours' : id === 'typography' ? 'Typography' : 'Radius'} editor`} onActivate={() => selectSection(id)}><span className="rail-button-content"><ScaleIcon name={id} /><span>{id === 'colours' ? 'Colours' : id === 'typography' ? 'Type' : 'Radius'}</span></span></Button>)}
        </div>
      </nav>
      <aside className="scale-inspector scale-chrome" {...chromeAttributes} aria-label="Theme inspector">
        <section className="inspector-panel colours-panel" hidden={section !== 'colours'} aria-labelledby="colours-editor-title">
          <h2 id="colours-editor-title">Colours</h2>
          <ToggleButtonGroup className="palette-selector" aria-label="Palette" selectionMode="single" selectedIds={[mode]} disallowEmptySelection onSelectionChange={([next]) => setMode(next)}><ToggleButton id="named" size="sm">Named <small>11</small></ToggleButton><ToggleButton id="neutral" size="sm">Neutral <small>27</small></ToggleButton></ToggleButtonGroup>
          <MainColorSelector label="BASE colour (–60)" value={activeColor} onChange={updateColor} />
          <div className="neutral-controls">{mode === 'named' && settings.family !== 'mono' ? <HexColorInput label="Neutral anchor" value={settings.neutralColor} onChange={(neutralColor) => update({ neutralColor, presetId: 'custom' })} /> : null}
            {mode === 'neutral' ? <><Checkbox checked={settings.whiteAnchor} onChange={(whiteAnchor) => update({ whiteAnchor })}>White at neutral-5</Checkbox><Checkbox checked={settings.family === 'mono'} onChange={(monochrome) => update({ family: monochrome ? 'mono' : 'standard', presetId: 'custom', ...(monochrome ? { neutralColor: settings.namedColor } : {}) })}>Monochrome theme</Checkbox></> : null}
          </div>
          <PivotSelector value={settings.contrastPivot} onChange={(contrastPivot) => update({ contrastPivot })} />
          <ContrastMethodSelector value={settings.contrastAlgorithm} onChange={(contrastAlgorithm) => update({ contrastAlgorithm })} />
          <PaletteRow title={mode === 'named' ? 'Named' : 'Neutral'} compiled={compiled} kind={mode} steps={mode === 'named' ? NAMED_STEPS : NEUTRAL_STEPS} contrastPivot={settings.contrastPivot} contrastAlgorithm={settings.contrastAlgorithm} onCopy={copy} />
          <div className="inspector-actions"><Button variant="neutral" size="sm" onActivate={() => randomize(false)}>Randomize</Button><Button variant="ghost" size="sm" onActivate={() => randomize(true)}>Randomize both</Button></div>
        </section>
        <div className="inspector-panel" hidden={section !== 'typography'}><TypographyMatrix settings={settings} onOverridesChange={updateTypographyOverrides} onError={(message) => setStatus({ tone: 'error', text: message })} /></div>
        <section className="inspector-panel radius-section" hidden={section !== 'radius'} aria-labelledby="radius-editor-title"><h2 id="radius-editor-title">Radius</h2><p className="inspector-description">Shared curvature across components</p><Slider label="Border radius factor" min={RADIUS_SETTINGS.minimum} max={RADIUS_SETTINGS.maximum} step={RADIUS_SETTINGS.step} value={settings.curvature} onChange={(curvature) => update({ curvature })} /><div className="radius-header"><output>{settings.curvature.toFixed(2)}x{settings.curvature === RADIUS_SETTINGS.default ? ' (default)' : ''}</output><Button variant="ghost" size="sm" onActivate={() => update({ curvature: RADIUS_SETTINGS.default })}>Reset</Button></div><div className="radius-row">{RADIUS_TOKENS.map(([name, multiplier]) => <div className="radius-item" key={name}><span className="radius-box" style={{ borderRadius: radiusValue(multiplier, settings.curvature) }} /><b>{name}</b><small>{radiusValue(multiplier, settings.curvature)}</small></div>)}</div></section>
        <div className="inspector-status">{embedded && appliedError ? <p className="status status-error" role="alert">{appliedError}</p> : null}<p className={`status status-${status.tone}`} role={exportOpen ? undefined : 'status'}>{status.text}</p></div>
      </aside>
      <section className="preview-workspace" aria-labelledby="component-preview-title">
        <div className="preview-toolbar scale-chrome" {...chromeAttributes}><h2 id="component-preview-title">Preview</h2><span className="preview-caption">{presetName} / {settings.colorMode === 'light' ? 'Light' : 'Dark'}</span></div>
        <Tabs className="preview-tabs scale-chrome" {...chromeAttributes} aria-label="Preview content" variant="underline" value={previewTab} onChange={setPreviewTab} items={[
          { id: 'components', label: 'Components', panel: previewUnavailable ? <section className="preview-unavailable"><h3>Component Preview unavailable</h3><p>This draft does not provide the site’s requested {previewState.unsupported.join(', ')} mode. Apply will be rejected until the draft supports it.</p></section> : <div className="preview-surface muxui-scale-preview" data-preview-panel="components" {...themeModeAttributes(compiled)}><ComponentPreview compiled={compiled} /></div> },
          { id: 'typography', label: 'Typography', panel: previewUnavailable ? <TypographySpecimens settings={settings} previewAvailable={false} /> : <div className="preview-surface muxui-scale-preview" data-preview-panel="typography" {...themeModeAttributes(compiled)}><TypographySpecimens settings={settings} /></div> },
        ]} />
      </section>
    </div>
  </AppRoot>;
}
