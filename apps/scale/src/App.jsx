import React from 'react';
import {
  Breadcrumbs,
  Button,
  Calendar,
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
  STANDARD_PRESETS,
  createScaleDocument,
  previewCss,
  previewPalette,
  presetSettings,
  randomScaleSettings,
  settingsFromDocument,
  validateScaleDocument,
} from './theme-contract.mjs';
import './styles.css';

const DRAFT_KEY = 'muxui-scale:draft:v1';
const PREFERENCES_KEY = 'muxui-scale:preferences:v1';
const RADIUS_TOKENS = Object.freeze([
  ['xs', 4], ['s', 6], ['m', 8], ['l', 12], ['xl', 16], ['2xl', 24],
]);

function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function migrateSettings(value) {
  const merged = { ...DEFAULT_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  // v1 stored pixel radii (8px). Scale uses Tale's 0..2 factor, where 1 is default.
  if (!Number.isFinite(Number(merged.curvature)) || Number(merged.curvature) > 2) merged.curvature = 1;
  merged.curvature = Math.max(0, Math.min(2, Number(merged.curvature)));
  return merged;
}

function readInitialSettings() {
  const hash = window.location.hash.replace(/^#/u, '');
  let preferences = {};
  try { preferences = JSON.parse(safeStorageGet(PREFERENCES_KEY) ?? '{}'); } catch { /* optional preference state */ }
  for (const encoded of [hash, safeStorageGet(DRAFT_KEY)]) {
    if (!encoded) continue;
    try {
      const value = JSON.parse(hash === encoded ? decodeURIComponent(encoded) : encoded);
      return migrateSettings({ ...preferences, ...value });
    } catch { /* invalid drafts are discarded */ }
  }
  return migrateSettings(preferences);
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

function radiusValue(multiplier, factor) {
  return `${(multiplier * 0.125 * factor).toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '')}rem`;
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

function HeaderBackgrounds({ value, onChange }) {
  return <div className="background-selector" aria-label="Preview background">
    <span className="background-label">Preview on</span>
    <div className="background-options">
      {BACKGROUNDS.map(([id, label]) => <button
        key={id}
        type="button"
        className={`background-option background-${id}${value === id ? ' is-selected' : ''}`}
        aria-label={`${label} background`}
        aria-pressed={value === id}
        title={label}
        onClick={() => { onChange(id); writePreference('background', id); }}
      />)}
    </div>
  </div>;
}

function ThemeCard({ name, namedColor, neutralColor, selected, onClick }) {
  return <button type="button" className={`theme-card${selected ? ' is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
    <span className="theme-swatches" aria-hidden="true"><span style={{ backgroundColor: namedColor }} /><span style={{ backgroundColor: neutralColor }} /></span>
    <span className="theme-name">{name}</span>
  </button>;
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
      <input aria-label={`${label} picker`} type="color" value={value} onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} />
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

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../gu)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
  return channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrastRatio(background, foreground) {
  const lighter = Math.max(relativeLuminance(background), relativeLuminance(foreground));
  const darker = Math.min(relativeLuminance(background), relativeLuminance(foreground));
  return (lighter + 0.05) / (darker + 0.05);
}

function bestContrast(background, first, second) {
  return contrastRatio(background, first) >= contrastRatio(background, second) ? first : second;
}

function contrastBadge(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA·LG';
  return '✕';
}

function paletteDisplay(palette, kind, settings) {
  const byShade = new Map(palette.map((entry) => [entry.step, entry.value]));
  const shades = palette.map((entry) => entry.step);
  const mirroredShades = kind === 'named' ? shades : shades.filter((shade) => shade !== 5);
  const reversed = [...mirroredShades].reverse();
  const mirror = Object.fromEntries(mirroredShades.map((shade, index) => [shade, reversed[index]]));
  if (kind !== 'named') mirror[5] = shades.at(-1);
  const first = byShade.get(shades[0]);
  const last = byShade.get(shades.at(-1));
  const isLightBackground = settings.background !== 'dark';
  const pivot = settings.contrastPivot === 'auto' ? 60 : Number(settings.contrastPivot);
  return palette.map(({ step, value }) => {
    const background = isLightBackground ? value : (byShade.get(mirror[step]) ?? value);
    const foreground = isLightBackground
      ? (kind === 'named' ? bestContrast(background, first, last) : (step < pivot ? last : first))
      : bestContrast(background, kind === 'named' ? last : first, kind === 'named' ? first : last);
    const ratio = contrastRatio(background, foreground);
    return { step, value, background, foreground, ratio, badge: contrastBadge(ratio), lightText: relativeLuminance(foreground) > 0.179 };
  });
}

function PaletteRow({ title, settings, kind, steps, onCopy }) {
  const palette = paletteDisplay(previewPalette(settings, kind, steps), kind, settings);
  return <div className="palette-group">
    <div className="palette-heading"><span>{title}</span><span>{steps.length} steps</span></div>
    <div className="palette-row" role="list" aria-label={`${title} colour scale`}>
      {palette.map(({ step, value, background, foreground, ratio, badge, lightText }) => <button className="palette-swatch" key={step} type="button" title={`Copy ${title} ${step}`} aria-label={`Copy ${title} ${step}, ${value}, ${ratio.toFixed(2)} to 1, ${badge}`} onClick={() => onCopy(value)}><span className="palette-swatch-color" style={{ backgroundColor: background, color: foreground }}><span className="swatch-shade">{step}</span>{step === 60 ? <span className="swatch-base" aria-label="Base shade" /> : null}<span className="swatch-ag">Ag</span><span className="swatch-ratio">{ratio.toFixed(2)}:1</span><span className={`swatch-badge${lightText ? ' is-light' : ''}`}>{badge}</span></span><span className="palette-swatch-label">{value}</span></button>)}
    </div>
  </div>;
}

function PivotSelector({ value, onChange }) {
  return <div className="pivot-selector"><span className="field-label">Light text from</span><div className="toggle-row" role="group" aria-label="Contrast pivot">
    <button type="button" className={`toggle-button${value === 'auto' ? ' is-selected' : ''}`} aria-pressed={value === 'auto'} onClick={() => onChange('auto')}>Auto</button>
    {NAMED_STEPS.map((step) => <button key={step} type="button" className={`toggle-button${String(value) === String(step) ? ' is-selected' : ''}`} aria-pressed={String(value) === String(step)} onClick={() => onChange(String(step))}>{step}</button>)}
  </div></div>;
}

function ComponentPreview({ settings }) {
  const style = { '--preview-action': settings.namedColor, '--preview-neutral': settings.neutralColor, '--preview-radius': radiusValue(8, settings.curvature) };
  const previewMode = settings.background === 'light' ? 'light' : 'dark';
  return <section className="component-preview" aria-labelledby="component-preview-title" style={style}>
    <div className="output-heading"><h2 id="component-preview-title">Component Preview</h2><span>{previewMode} mode</span></div>
    <div className="preview-canvas">
      <div className="preview-scale-strip"><span /><span /><span /><span /><span /><span /></div>
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

export default function App() {
  const [settings, setSettings] = React.useState(readInitialSettings);
  const [themeName, setThemeName] = React.useState('My Mux theme');
  const [slug, setSlug] = React.useState('my-mux-theme');
  const [revision, setRevision] = React.useState(null);
  const [status, setStatus] = React.useState({ tone: 'idle', text: 'Draft changes stay in this browser until you save them.' });
  const [importInputKey, setImportInputKey] = React.useState(0);
  const [mode, setMode] = React.useState('named');

  React.useEffect(() => { writeDraft(settings); }, [settings]);
  const update = React.useCallback((patch) => setSettings((current) => ({ ...current, ...patch })), []);
  const applyPreset = (family, id) => update(presetSettings(family, id));
  const randomize = (both) => {
    try {
      const next = randomScaleSettings(settings);
      setSettings(both ? next : { ...settings, namedColor: next.namedColor, presetId: 'custom' });
      setStatus({ tone: 'success', text: both ? 'Generated WCAG-safe named and neutral colours.' : 'Generated a WCAG-safe base colour.' });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setStatus({ tone: 'success', text: 'Copied to clipboard.' }); }
    catch { setStatus({ tone: 'error', text: 'Clipboard access is unavailable in this browser.' }); }
  };
  const save = async () => {
    try {
      const document = createScaleDocument(settings, { slug });
      let expectedRevision = revision;
      if (!expectedRevision) {
        const existing = await fetch(`/__muxui/scale/themes/${slug}`);
        if (existing.ok) expectedRevision = (await existing.json()).revision;
        else if (existing.status !== 404) throw new Error((await existing.json()).error ?? 'Theme lookup failed');
      }
      const response = await fetch(`/__muxui/scale/themes/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(expectedRevision ? { 'if-match': expectedRevision } : {}) }, body: `${JSON.stringify(document)}\n` });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Theme save failed');
      setRevision(body.revision); setStatus({ tone: 'success', text: `Saved ${themeName} as ${slug}.` });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const load = async () => {
    try {
      const response = await fetch(`/__muxui/scale/themes/${slug}`); const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Theme load failed');
      validateScaleDocument(body.theme); setSettings(settingsFromDocument(body.theme)); setRevision(body.revision);
      setThemeName(slug.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())); setStatus({ tone: 'success', text: `Loaded ${slug}.` });
    } catch (error) { setStatus({ tone: 'error', text: error.message }); }
  };
  const exportJson = () => {
    const source = createScaleDocument(settings, { slug }); const blob = new Blob([`${JSON.stringify(source, null, 2)}\n`], { type: 'application/json' });
    const link = window.document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${slug}.json`; link.click(); URL.revokeObjectURL(link.href); setStatus({ tone: 'success', text: 'Exported a validated theme source.' });
  };
  const importJson = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const document = JSON.parse(await file.text()); validateScaleDocument(document); setSettings(settingsFromDocument(document));
      setThemeName(document.id.slice('muxui:theme:'.length).replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())); setSlug(document.id.slice('muxui:theme:'.length)); setRevision(null); setStatus({ tone: 'success', text: 'Imported and validated theme source. Save to persist it.' });
    } catch (error) { setStatus({ tone: 'error', text: `Import rejected: ${error.message}` }); }
    finally { setImportInputKey((value) => value + 1); }
  };

  const css = `${previewCss(settings)}\n\n/* Copy CSS is a derived preview projection. */`;
  const activeColor = mode === 'named' ? settings.namedColor : settings.neutralColor;
  const reset = () => { setSettings({ ...DEFAULT_SETTINGS }); setRevision(null); setStatus({ tone: 'idle', text: 'Draft reset.' }); };

  const previewColorScheme = settings.background === 'light' ? 'light' : 'dark';
  return <div className="scale-app muxui-scale-preview" data-preview-background={settings.background} data-muxui-color-scheme={previewColorScheme}>
    <style data-muxui-scale-theme>{css}</style>
    <header className="scale-header"><div className="header-copy"><h1>Theme Playground</h1><p>Generate named and neutral colour scales from a base colour. Preview how they look across components, copy the CSS tokens, and fine-tune contrast pivot points.</p></div><div className="header-tools"><HeaderBackgrounds value={settings.background} onChange={(background) => update({ background, colorMode: background === 'light' ? 'light' : 'dark' })} /><div className="header-actions"><span className={`status status-${status.tone}`} role="status">{status.text}</span><button className="text-action" type="button" onClick={() => copy(window.location.href)}>Share URL</button><button className="text-action" type="button" onClick={load}>Load</button><button className="text-action" type="button" onClick={save}>Save</button></div></div></header>
    <main className="main-wrapper">
      <section className="theme-section" aria-labelledby="standard-themes-title"><div className="theme-section-heading"><h2 id="standard-themes-title">Standard themes</h2><span>Distinct brand + neutral scales from paired anchors</span></div><div className="theme-grid">{STANDARD_PRESETS.map(([id, name, namedColor, neutralColor]) => <ThemeCard key={id} name={name} namedColor={namedColor} neutralColor={neutralColor} selected={settings.family === 'standard' && settings.presetId === id} onClick={() => applyPreset('standard', id)} />)}</div></section>
      <section className="theme-section" aria-labelledby="mono-themes-title"><div className="theme-section-heading"><h2 id="mono-themes-title">Monochrome themes</h2><span>Shared brand + neutral scales from one colour anchor</span></div><div className="theme-grid">{MONO_PRESETS.map(([id, name, color]) => <ThemeCard key={id} name={name} namedColor={color} neutralColor={color} selected={settings.family === 'mono' && settings.presetId === id} onClick={() => applyPreset('mono', id)} />)}</div></section>
      <section className="toolbar-row" aria-label="Scale controls"><div className="toggle-row"><button type="button" className={`toggle-button${mode === 'named' ? ' is-selected' : ''}`} aria-pressed={mode === 'named'} onClick={() => setMode('named')}>Named</button><button type="button" className={`toggle-button${mode === 'neutral' ? ' is-selected' : ''}`} aria-pressed={mode === 'neutral'} onClick={() => setMode('neutral')}>Neutral</button></div><button type="button" className="secondary-button" onClick={() => randomize(false)}>Randomize</button><button type="button" className="secondary-button" onClick={() => randomize(true)}>Randomize both</button><button type="button" className="quiet-button" onClick={reset}>Reset to defaults</button>{mode === 'neutral' ? <><label className="inline-check"><input type="checkbox" checked={settings.whiteAnchor} onChange={(event) => update({ whiteAnchor: event.target.checked })} /> White at neutral-5</label><label className="inline-check"><input type="checkbox" checked={settings.family === 'mono'} onChange={(event) => { const family = event.target.checked ? 'mono' : 'standard'; applyPreset(family, family === 'mono' ? MONO_PRESETS[0][0] : STANDARD_PRESETS[0][0]); }} /> Monochrome theme</label></> : null}</section>
      <section className="scale-editor" aria-label="Theme scale editor"><div className="editor-controls"><MainColorSelector label="BASE colour (–60)" value={activeColor} onChange={(value) => update(mode === 'named' ? { namedColor: value, presetId: 'custom' } : { neutralColor: value, presetId: 'custom' })} />{mode === 'named' ? <HexColorInput label="Neutral anchor" value={settings.neutralColor} onChange={(neutralColor) => update({ neutralColor, presetId: 'custom' })} /> : null}</div><PivotSelector value={settings.contrastPivot} onChange={(contrastPivot) => update({ contrastPivot })} /><PaletteRow title={mode === 'named' ? 'Named' : 'Neutral'} settings={settings} kind={mode} steps={mode === 'named' ? NAMED_STEPS : NEUTRAL_STEPS} onCopy={copy} />
        <div className="radius-section"><div className="radius-header"><span>Border radius</span><input aria-label="Border radius factor" type="range" min="0" max="2" step="0.01" value={settings.curvature} onChange={(event) => update({ curvature: Number(event.target.value) })} /><output>{settings.curvature.toFixed(2)}x{settings.curvature === 1 ? ' (default)' : ''}</output><button type="button" className="quiet-button" onClick={() => update({ curvature: 1 })}>Reset</button></div><div className="radius-row">{RADIUS_TOKENS.map(([name, multiplier]) => <div className="radius-item" key={name}><span className="radius-box" style={{ borderRadius: radiusValue(multiplier, settings.curvature) }} /><b>{name}</b><small>{Math.round(multiplier * 0.125 * settings.curvature * 16)}px</small></div>)}</div></div>
        <div className="output-row"><section className="css-column"><div className="output-heading"><h2>CSS tokens</h2><button type="button" className="quiet-button" onClick={() => copy(css)}>Copy CSS</button></div><pre className="css-output" aria-label="Generated CSS"><code>{css}</code></pre><div className="source-controls"><label>Theme name<input value={themeName} onChange={(event) => setThemeName(event.target.value)} /></label><label>Slug<input value={slug} onChange={(event) => setSlug(event.target.value)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><button type="button" className="secondary-button" onClick={exportJson}>Export JSON</button><label className="secondary-button file-action">Import JSON<input key={importInputKey} type="file" accept="application/json" onChange={importJson} /></label></div></section><ComponentPreview settings={settings} /></div>
      </section>
    </main>
  </div>;
}
