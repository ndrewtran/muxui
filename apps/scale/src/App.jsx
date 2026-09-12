import React from 'react';
import {
  Breadcrumbs,
  Button,
  Calendar,
  Card,
  Checkbox,
  ColorArea,
  ColorSlider,
  Disclosure,
  GridList,
  Link,
  Meter,
  Menu,
  NumberField,
  ProgressBar,
  RadioGroup,
  SearchField,
  Select,
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
  BACKGROUNDS,
  DEFAULT_SETTINGS,
  MONO_PRESETS,
  NAMED_STEPS,
  NEUTRAL_STEPS,
  RADIUS_SETTINGS,
  RADIUS_TOKENS,
  STANDARD_PRESETS,
  createScaleDocument,
  previewCss,
  previewTheme,
  previewSwatches,
  presetSettings,
  randomScaleSettings,
  radiusValue,
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

function migrateSettings(value) {
  const merged = { ...DEFAULT_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  // v1 stored pixel radii (8px). Scale uses a 0..2 factor, where 1 is default.
  if (!Number.isFinite(Number(merged.curvature)) || Number(merged.curvature) > RADIUS_SETTINGS.maximum) merged.curvature = RADIUS_SETTINGS.default;
  merged.curvature = Math.max(RADIUS_SETTINGS.minimum, Math.min(RADIUS_SETTINGS.maximum, Number(merged.curvature)));
  if (typeof merged.contrastPivot === 'string' && /^\d+$/u.test(merged.contrastPivot)) merged.contrastPivot = Number(merged.contrastPivot);
  return merged;
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
      return { settings: settingsForScope(migrateSettings({ ...preferences, ...value }), embedded), error };
    } catch (cause) { error = `Saved settings rejected: ${cause.message}`; }
  }
  try {
    const settings = migrateSettings(preferences);
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

function HeaderBackgrounds({ value, modes, onChange }) {
  return <div className="background-selector" aria-label="Preview background">

    <div className="background-options">
      {BACKGROUNDS.map(([id, label]) => <button
        key={id}
        type="button"
        className={`background-option background-${id}${value === id ? ' is-selected' : ''}`}
        aria-label={`${label} background`}
        aria-pressed={value === id}
        disabled={!modes.includes(id === 'light' ? 'light' : 'dark')}
        title={label}
        onClick={() => { onChange(id); writePreference('background', id); }}
      />)}
    </div>
  </div>;
}

function ModePreferences({ values, modes, onChange }) {
  return <div className="mode-preferences" aria-label="Site preferences">
    {[
      ['contrast', 'Contrast'],
      ['motion', 'Motion'],
      ['density', 'Density'],
    ].map(([axis, label]) => <label key={axis}>
      <span>{label}</span>
      <select value={values[axis] ?? 'auto'} onChange={(event) => onChange(axis, event.target.value)} aria-label={`${label} preference`}>
        <option value="auto">Auto</option>
        {(modes[axis] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
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

function ThemeCard({ name, namedColor, neutralColor, selected, onClick }) {
  return <Card.Button className="theme-card" variant="outlined" padding="sm" selected={selected} onActivate={onClick} aria-pressed={selected}>
    <span className="theme-swatches" aria-hidden="true"><span style={{ backgroundColor: namedColor }} /><span style={{ backgroundColor: neutralColor }} /></span>
    <span className="theme-name">{name}</span>
  </Card.Button>;
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
      <input aria-label={`${label} hex`} type="text" value={draft.replace(/^#/u, '')} maxLength={6} spellCheck="false" onChange={(event) => setDraft(`#${event.target.value.replace(/^#/u, '')}`)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }} />
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

function PaletteRow({ title, compiled, kind, steps, onCopy }) {
  const palette = previewSwatches(compiled, kind, steps);
  return <div className="palette-group">
    <div className="palette-heading"><span>{title}</span><span>{steps.length} steps</span></div>
    <div className="palette-row" role="list" aria-label={`${title} colour scale`}>
      {palette.map(({ step, value, background, foreground, ratio, badge }) => <button className="palette-swatch" key={step} type="button" title={`Copy ${title} ${step}`} aria-label={`Copy ${title} ${step}, ${value}, ${ratio.toFixed(2)} to 1, ${badge}`} onClick={() => onCopy(value)}><span className="palette-swatch-color" style={{ backgroundColor: background, color: foreground }}><span className="swatch-shade">{step}</span>{step === 60 ? <span className="swatch-base" aria-label="Base shade" /> : null}<span className="swatch-ag">Ag</span><span className="swatch-ratio">{ratio.toFixed(2)}:1</span><span className="swatch-badge">{badge}</span></span><span className="palette-swatch-label">{value}</span></button>)}
    </div>
  </div>;
}

function PivotSelector({ value, onChange }) {
  return <div className="pivot-selector">
    <span className="field-label">Light text from</span>
    <ToggleButtonGroup aria-label="Contrast pivot" selectionMode="single" selectedIds={[String(value)]} onSelectionChange={([next]) => { if (next) onChange(next === 'auto' ? 'auto' : Number(next)); }}>
      <ToggleButton id="auto" size="sm">Auto</ToggleButton>
      {NAMED_STEPS.map((step) => <ToggleButton key={step} id={String(step)} size="sm">{step}</ToggleButton>)}
    </ToggleButtonGroup>
  </div>;
}

function ComponentPreview({ settings }) {
  const previewMode = settings.background === 'light' ? 'light' : 'dark';
  return <section className="component-preview" aria-labelledby="component-preview-title">
    <div className="output-heading"><h2 id="component-preview-title">Component Preview</h2><span>{previewMode} mode</span></div>
    <div className="preview-canvas">
      <div className="preview-group preview-actions">
        <Button variant="primary" size="sm" onActivate={() => {}}>Primary</Button>
        <Button variant="secondary" size="sm" onActivate={() => {}}>Secondary</Button>
        <Button variant="ghost" size="sm" onActivate={() => {}}>Ghost</Button>
        <ToggleButton size="sm" defaultSelected>Toggle</ToggleButton>
        <ToggleButtonGroup aria-label="Preview alignment" defaultSelectedIds={['center']} selectionMode="single">
          <ToggleButton id="left" size="sm">Left</ToggleButton>
          <ToggleButton id="center" size="sm">Center</ToggleButton>
          <ToggleButton id="right" size="sm">Right</ToggleButton>
        </ToggleButtonGroup>
      </div>
      <div className="preview-form">
        <TextField aria-label="Preview theme name" placeholder="Theme name" />
        <div className="preview-choice-row"><Checkbox defaultChecked>Include dark mode</Checkbox><Switch label="Accent" defaultSelected /></div>
        <ProgressBar label="Contrast target" value={68} />
        <Meter label="Storage" value={40} />
      </div>
      <div className="preview-grid">
        <div className="preview-block"><span className="preview-label">Search and number fields</span><SearchField aria-label="Preview search" placeholder="Search…" /><NumberField aria-label="Preview quantity" defaultValue={5} minValue={0} maxValue={100} /></div>
        <div className="preview-block"><span className="preview-label">Radio and select</span><RadioGroup aria-label="Preview choices" defaultValue="b" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} /><Select aria-label="Preview fruit" placeholder="Choose…" items={['Apple', 'Banana', 'Cherry']} /></div>
        <div className="preview-block"><span className="preview-label">Tabs and disclosure</span><Tabs aria-label="Preview sections" defaultValue="overview" items={[{ id: 'overview', label: 'Overview' }, { id: 'details', label: 'Details' }, { id: 'settings', label: 'Settings' }]} /><Disclosure title="Show details" defaultExpanded>Additional details revealed on expand.</Disclosure></div>
        <div className="preview-block"><span className="preview-label">Tags and grid list</span><TagGroup aria-label="Preview tags" items={['Design', 'Development', 'Docs']} /><GridList aria-label="Preview items" items={['Design tokens', 'Components', 'Documentation']} defaultSelectedIds={['Components']} selectionMode="multiple" /></div>
        <div className="preview-block"><span className="preview-label">Calendar</span><Calendar aria-label="Preview calendar" /></div>
        <div className="preview-block"><span className="preview-label">Menu and tooltip</span><Menu aria-label="Preview menu" items={['Edit', 'Duplicate', 'Delete']} /><Tooltip content="Tooltip content" trigger={<Button variant="secondary" size="sm">Hover me</Button>} /></div>
      </div>
      <Table aria-label="Preview people" columns={[{ id: 'name', label: 'Name', isRowHeader: true }, { id: 'role', label: 'Role' }, { id: 'status', label: 'Status' }]} rows={[{ id: 'r1', values: { name: 'Alice', role: 'Engineer', status: 'Active' } }, { id: 'r2', values: { name: 'Bob', role: 'Designer', status: 'Active' } }]} />
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
  const [importInputKey, setImportInputKey] = React.useState(0);
  const [mode, setMode] = React.useState('named');
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
  const importJson = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('Theme files must be no larger than 256 KiB.');
      const document = JSON.parse(await file.text()); validateScaleDocument(document); const nextSettings = settingsForScope(settingsFromDocument(document), embedded); setSettings(nextSettings);
      setSlug(document.id.slice('muxui:theme:'.length)); setRevision(null); setStatus({ tone: 'success', text: embedded ? 'Imported and validated theme source. Apply to site when ready.' : 'Imported and validated theme source. Save to persist it.' });
    } catch (error) { setStatus({ tone: 'error', text: `${embedded ? 'Import unavailable for this site' : 'Import rejected'}: ${error.message}` }); }
    finally { setImportInputKey((value) => value + 1); }
  };

  const draftDocument = React.useMemo(() => {
    try { return createScaleDocument(settings, { slug }); }
    catch { return null; }
  }, [settings, slug]);
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
  const css = React.useMemo(() => previewCss(settings, { selector: ':root' }), [settings]);
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
  return <div className={`scale-app muxui-scale-preview${embedded ? ' is-embedded' : ''}`} data-preview-background={settings.background} {...(previewUnavailable ? {} : { 'data-muxui-color-scheme': compiled.modes.colorScheme, 'data-muxui-contrast': compiled.modes.contrast, 'data-muxui-motion': compiled.modes.motion, 'data-muxui-density': compiled.modes.density, 'data-muxui-direction': compiled.modes.direction })}>
    {previewUnavailable ? null : <style data-muxui-scale-theme>{compiled.css}</style>}
    <header className="scale-header"><div className="header-copy">{embedded ? <h2>Theme Playground</h2> : <h1>Theme Playground</h1>}<p>Generate named and neutral colour scales from a base colour. Preview how they look across components, copy the CSS tokens, and fine-tune contrast pivot points.</p></div><div className="header-tools">{embedded ? <><span className="site-mode">Site follows {siteColorMode}</span><ModePreferences values={modePreferences} modes={settings.themeModes} onChange={updateModePreference} /></> : <HeaderBackgrounds modes={settings.themeModes.colorScheme} value={settings.background} onChange={(background) => update({ background, colorMode: background === 'light' ? 'light' : 'dark' })} />}<div className="header-actions"><span className={`status status-${status.tone}`} role="status">{status.text}</span>{embedded ? <><span className={`draft-state${hasUnappliedChanges ? ' draft-state-unapplied' : ''}`}>{hasUnappliedChanges ? 'Draft only' : 'Applied'}</span><button className="apply-action" type="button" onClick={apply} disabled={!hasUnappliedChanges}>Apply to site</button><button className="text-action" type="button" onClick={resetApplied}>Reset applied</button></> : <><button className="text-action" type="button" onClick={() => copy(window.location.href)}>Share URL</button><button className="text-action" type="button" onClick={load}>Load</button><button className="text-action" type="button" onClick={save}>Save</button></>}</div></div></header>
    <div className="main-wrapper">
      <section className="theme-section" aria-labelledby="standard-themes-title"><div className="theme-section-heading"><h2 id="standard-themes-title">Standard themes</h2><span>Distinct brand + neutral scales from paired anchors</span></div><div className="theme-grid">{STANDARD_PRESETS.map(([id, name, namedColor, neutralColor]) => <ThemeCard key={id} name={name} namedColor={namedColor} neutralColor={neutralColor} selected={settings.family === 'standard' && settings.presetId === id} onClick={() => applyPreset('standard', id)} />)}</div></section>
      <section className="theme-section" aria-labelledby="mono-themes-title"><div className="theme-section-heading"><h2 id="mono-themes-title">Monochrome themes</h2><span>Shared brand + neutral scales from one colour anchor</span></div><div className="theme-grid">{MONO_PRESETS.map(([id, name, color]) => <ThemeCard key={id} name={name} namedColor={color} neutralColor={color} selected={settings.family === 'mono' && settings.presetId === id} onClick={() => applyPreset('mono', id)} />)}</div></section>
      <section className="toolbar-row" aria-label="Scale controls">
        <ToggleButtonGroup aria-label="Palette" selectionMode="single" selectedIds={[mode]} onSelectionChange={([next]) => { if (next) setMode(next); }}>
          <ToggleButton id="named" size="sm">Named</ToggleButton>
          <ToggleButton id="neutral" size="sm">Neutral</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="neutral" size="sm" onActivate={() => randomize(false)}>Randomize</Button>
        <Button variant="neutral" size="sm" onActivate={() => randomize(true)}>Randomize both</Button>
        <Button variant="ghost" size="sm" onActivate={reset}>{embedded ? 'Reset draft' : 'Reset to defaults'}</Button>
        {mode === 'neutral' ? <>
          <ToggleButton size="sm" selected={settings.whiteAnchor} onChange={(whiteAnchor) => update({ whiteAnchor })}>White at neutral-5</ToggleButton>
          <ToggleButton size="sm" selected={settings.family === 'mono'} onChange={(monochrome) => update({ family: monochrome ? 'mono' : 'standard', presetId: 'custom', ...(monochrome ? { neutralColor: settings.namedColor } : {}) })}>Monochrome theme</ToggleButton>
        </> : null}
      </section>
      {embedded && appliedError ? <p className="status status-error embedded-theme-error" role="alert">{appliedError}</p> : null}
      <section className="scale-editor" aria-label="Theme scale editor"><div className="editor-controls"><MainColorSelector label="BASE colour (–60)" value={activeColor} onChange={updateColor} />{mode === 'named' && settings.family !== 'mono' ? <HexColorInput label="Neutral anchor" value={settings.neutralColor} onChange={(neutralColor) => update({ neutralColor, presetId: 'custom' })} /> : null}</div><PivotSelector value={settings.contrastPivot} onChange={(contrastPivot) => update({ contrastPivot })} /><PaletteRow title={mode === 'named' ? 'Named' : 'Neutral'} compiled={compiled} kind={mode} steps={mode === 'named' ? NAMED_STEPS : NEUTRAL_STEPS} onCopy={copy} />
        <div className="radius-section"><div className="radius-header"><span>Border radius</span><input aria-label="Border radius factor" type="range" min={RADIUS_SETTINGS.minimum} max={RADIUS_SETTINGS.maximum} step={RADIUS_SETTINGS.step} value={settings.curvature} onChange={(event) => update({ curvature: Number(event.target.value) })} /><output>{settings.curvature.toFixed(2)}x{settings.curvature === RADIUS_SETTINGS.default ? ' (default)' : ''}</output><button type="button" className="quiet-button" onClick={() => update({ curvature: RADIUS_SETTINGS.default })}>Reset</button></div><div className="radius-row">{RADIUS_TOKENS.map(([name, multiplier]) => <div className="radius-item" key={name}><span className="radius-box" style={{ borderRadius: radiusValue(multiplier, settings.curvature) }} /><b>{name}</b><small>{radiusValue(multiplier, settings.curvature)}</small></div>)}</div></div>
        <div className="output-row"><section className="css-column"><div className="output-heading"><h2>CSS tokens</h2><button type="button" className="quiet-button" onClick={() => copy(css)}>Copy CSS</button></div><pre className="css-output" aria-label="Generated CSS"><code>{css}</code></pre><div className="source-controls"><label>Theme slug<input value={slug} onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><button type="button" className="secondary-button" onClick={exportJson}>Export JSON</button><label className="secondary-button file-action">Import JSON<input key={importInputKey} type="file" accept="application/json" onChange={importJson} /></label></div></section>{previewUnavailable ? <section className="component-preview preview-unavailable" aria-label="Component Preview"><div className="output-heading"><h2>Component Preview unavailable</h2></div><p>This draft does not provide the site’s requested {previewState.unsupported.join(', ')} mode. Apply will be rejected until the draft supports it.</p></section> : <ComponentPreview settings={settings} />}</div>
      </section>
    </div>
  </div>;
}
