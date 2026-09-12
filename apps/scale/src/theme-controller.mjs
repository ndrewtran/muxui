import { compileThemeAuthoringDocument } from '@muxui/tokens/authoring';
import defaultThemeSource from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { validateScaleDocument } from './theme-contract.mjs';

export const APPLIED_THEME_KEY = 'muxui-scale:applied:v1';
export const APPLIED_THEME_STYLE_ID = 'muxui-applied-theme';
export const THEME_STATUS_EVENT = 'muxui:theme-status';
const THEME_STATUS_GLOBAL = '__muxuiThemeStatus';
const THEME_STATE_GLOBAL = '__muxuiThemeState';
const APPLIED_THEME_ROOT_CLASS = 'muxui-applied-theme';
const APPLIED_THEME_SELECTOR = `.${APPLIED_THEME_ROOT_CLASS}.${APPLIED_THEME_ROOT_CLASS}`;
const MODE_AXES = ['colorScheme', 'contrast', 'motion', 'density', 'direction'];
const PREFERENCE_AXES = ['contrast', 'motion', 'density'];

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function storage() {
  if (!isBrowser()) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStorage() {
  const store = storage();
  if (!store) return { raw: null, available: false };
  try {
    return { raw: store.getItem(APPLIED_THEME_KEY), available: true };
  } catch {
    return { raw: null, available: false };
  }
}

function readModePreferences() {
  const store = storage();
  if (!store) return {};
  try {
    const value = JSON.parse(store.getItem('muxui-scale:mode-preferences:v1') ?? '{}');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(PREFERENCE_AXES.flatMap((axis) => {
      const candidate = value[axis];
      const allowed = defaultThemeSource.theme.modeAxes[axis];
      return candidate === 'auto' || (typeof candidate === 'string' && allowed.includes(candidate)) ? [[axis, candidate]] : [];
    }));
  } catch {
    return {};
  }
}

function sharedState() {
  if (!isBrowser()) return { activeTheme: null, rootModePreferences: null, modePreferences: {} };
  if (!window[THEME_STATE_GLOBAL]) {
    window[THEME_STATE_GLOBAL] = { activeTheme: null, rootModePreferences: null, modePreferences: readModePreferences(), storageStatus: null };
  }
  return window[THEME_STATE_GLOBAL];
}

function dispatchStatus(detail) {
  if (isBrowser()) {
    window[THEME_STATUS_GLOBAL] = detail;
    window.dispatchEvent(new CustomEvent(THEME_STATUS_EVENT, { detail }));
  }
}

function parseStoredTheme() {
  const { raw, available } = readStorage();
  if (!available) return { theme: null, error: 'Browser storage is unavailable; applied theme will last on this page only.', storageAvailable: false };
  if (!raw) return { theme: null, error: null, storageAvailable: available };
  try {
    const value = JSON.parse(raw);
    return { theme: validateScaleDocument(value), error: null, storageAvailable: available };
  } catch (error) {
    return {
      theme: null,
      error: `Saved site theme rejected: ${error instanceof Error ? error.message : 'invalid theme source'}`,
      storageAvailable: available,
    };
  }
}

export function getAppliedThemeStatus() {
  const state = sharedState();
  const status = parseStoredTheme();
  const lastStatus = isBrowser() ? window[THEME_STATUS_GLOBAL] : null;
  if (state.activeTheme && lastStatus?.kind === 'error') return { ...status, theme: state.activeTheme, error: lastStatus.error, inMemoryOnly: !status.storageAvailable || !status.theme };
  if (state.activeTheme) return { ...status, theme: state.activeTheme, error: null, inMemoryOnly: !status.storageAvailable || !status.theme };
  if (!status.error && lastStatus?.kind === 'error') return { ...status, error: lastStatus.error };
  return status;
}

export function getModePreferences() {
  return { ...sharedState().modePreferences };
}

function writeModePreferences(preferences) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem('muxui-scale:mode-preferences:v1', JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function setModePreference(axis, value) {
  if (!PREFERENCE_AXES.includes(axis)) throw new Error(`Unsupported preference axis: ${axis}.`);
  const allowed = defaultThemeSource.theme.modeAxes[axis];
  if (value !== 'auto' && !allowed.includes(value)) throw new Error(`Unsupported ${axis} mode: ${value}.`);
  const state = sharedState();
  state.modePreferences = { ...state.modePreferences, [axis]: value };
  const persisted = writeModePreferences(state.modePreferences);
  dispatchStatus({ kind: 'preferences', preferences: getModePreferences(), persisted });
  window.__muxuiThemeController?.sync?.();
  return { preferences: getModePreferences(), persisted };
}

function preferredColorScheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function prefers(query) {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function modeFor(theme, axis, requested) {
  const values = theme.modes[axis];
  if (values.includes(requested)) return { value: requested, supported: true };
  const fallback = defaultThemeSource.theme.defaultModes[axis];
  if (values.includes(fallback)) return { value: fallback, supported: false };
  return { value: values[0], supported: false };
}

function requestedModes(theme) {
  const root = document.documentElement;
  const state = sharedState();
  const initial = state.rootModePreferences ?? root.dataset;
  const preferences = state.modePreferences;
  const requested = {
    colorScheme: preferredColorScheme(),
    contrast: preferences.contrast && preferences.contrast !== 'auto' ? preferences.contrast : prefers('(prefers-contrast: more)') ? 'more' : initial.muxuiContrast ?? 'standard',
    motion: preferences.motion && preferences.motion !== 'auto' ? preferences.motion : prefers('(prefers-reduced-motion: reduce)') ? 'reduced' : initial.muxuiMotion ?? 'full',
    density: preferences.density && preferences.density !== 'auto' ? preferences.density : initial.muxuiDensity ?? defaultThemeSource.theme.defaultModes.density,
    direction: root.dir === 'rtl' ? 'rtl' : initial.muxuiDirection ?? 'ltr',
  };
  return Object.fromEntries(MODE_AXES.map((axis) => [axis, modeFor(theme, axis, requested[axis])]));
}

function applyRootAttributes(modes) {
  const root = document.documentElement;
  for (const axis of MODE_AXES) root.setAttribute(`data-muxui-${axis.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`, modes[axis]);
  if (modes.motion === 'reduced') root.setAttribute('data-reduced-motion', '');
  else root.removeAttribute('data-reduced-motion');
}

function removeAppliedStyle() {
  document.getElementById(APPLIED_THEME_STYLE_ID)?.remove();
  document.documentElement.classList.remove(APPLIED_THEME_ROOT_CLASS);
}

function compileAppliedTheme(theme) {
  const requested = requestedModes(theme);
  const resolved = Object.fromEntries(MODE_AXES.map((axis) => [axis, requested[axis].value]));
  const unsupportedModes = MODE_AXES.filter((axis) => !requested[axis].supported);
  if (unsupportedModes.length) {
    const error = new Error(`Theme does not support requested modes: ${unsupportedModes.join(', ')}.`);
    error.unsupportedModes = unsupportedModes;
    throw error;
  }
  const compiled = compileThemeAuthoringDocument(theme, {
    source: defaultThemeSource,
    target: 'web.css',
    selector: APPLIED_THEME_SELECTOR,
    modes: resolved,
  });
  let style = document.getElementById(APPLIED_THEME_STYLE_ID);
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement('style');
    style.id = APPLIED_THEME_STYLE_ID;
    style.dataset.muxuiTheme = 'applied';
    document.head.append(style);
  }
  style.textContent = compiled.css;
  document.documentElement.classList.add(APPLIED_THEME_ROOT_CLASS);
  applyRootAttributes(resolved);
  return { modes: resolved, unsupportedModes };
}

function writeStoredTheme(theme) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(APPLIED_THEME_KEY, JSON.stringify(theme));
    return true;
  } catch {
    return false;
  }
}

function resetStoredTheme() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(APPLIED_THEME_KEY);
    return true;
  } catch {
    return false;
  }
}

function restoreDefaultAttributes() {
  const fallbackTheme = { modes: defaultThemeSource.theme.modeAxes };
  const requested = requestedModes(fallbackTheme);
  applyRootAttributes(Object.fromEntries(MODE_AXES.map((axis) => [axis, requested[axis].value])));
}

export function applyTheme(theme) {
  if (!isBrowser()) throw new Error('Theme application requires a browser.');
  const validated = validateScaleDocument(theme);
  const result = compileAppliedTheme(validated);
  const state = sharedState();
  state.activeTheme = validated;
  const persisted = writeStoredTheme(validated);
  state.storageStatus = parseStoredTheme();
  const detail = { kind: 'applied', theme: validated, persisted, ...result };
  dispatchStatus(detail);
  return detail;
}

export function resetAppliedTheme() {
  if (!isBrowser()) throw new Error('Theme reset requires a browser.');
  const persisted = resetStoredTheme();
  const state = sharedState();
  state.activeTheme = null;
  removeAppliedStyle();
  restoreDefaultAttributes();
  state.storageStatus = parseStoredTheme();
  const detail = { kind: 'reset', persisted };
  dispatchStatus(detail);
  return detail;
}

export function startThemeController() {
  if (!isBrowser()) return null;
  if (window.__muxuiThemeController) return window.__muxuiThemeController;

  const state = sharedState();
  const stored = parseStoredTheme();
  state.storageStatus = stored;
  state.activeTheme = stored.theme;
  state.rootModePreferences = {
    muxuiContrast: document.documentElement.dataset.muxuiContrast,
    muxuiMotion: document.documentElement.dataset.muxuiMotion,
    muxuiDensity: document.documentElement.dataset.muxuiDensity,
    muxuiDirection: document.documentElement.dataset.muxuiDirection,
  };
  const sync = () => {
    const current = state.activeTheme;
    if (current) {
      try {
        const result = compileAppliedTheme(current);
        const currentStatus = state.storageStatus ?? parseStoredTheme();
        dispatchStatus({ kind: 'restored', theme: current, storageAvailable: currentStatus.storageAvailable, ...result });
      } catch (error) {
        removeAppliedStyle();
        restoreDefaultAttributes();
        dispatchStatus({ kind: 'error', error: error instanceof Error ? error.message : 'Saved site theme rejected: invalid theme source', unsupportedModes: error?.unsupportedModes ?? [] });
      }
    } else {
      removeAppliedStyle();
      restoreDefaultAttributes();
      const currentStatus = state.storageStatus ?? parseStoredTheme();
      if (currentStatus.error) dispatchStatus({ kind: 'error', error: currentStatus.error, storageAvailable: currentStatus.storageAvailable });
      else dispatchStatus({ kind: 'reset', persisted: currentStatus.storageAvailable, storageAvailable: currentStatus.storageAvailable });
    }
  };
  sync();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === 'data-theme' || mutation.attributeName === 'dir')) sync();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'dir'] });
  const mediaQueries = ['(prefers-reduced-motion: reduce)', '(prefers-contrast: more)'];
  const mediaListeners = mediaQueries.map((query) => {
    const media = window.matchMedia(query);
    const listener = () => sync();
    media.addEventListener?.('change', listener);
    return { media, listener };
  });
  const controller = {
    apply: applyTheme,
    reset: resetAppliedTheme,
    getStatus: getAppliedThemeStatus,
    getModePreferences,
    setModePreference,
    sync,
    dispose() {
      observer.disconnect();
      mediaListeners.forEach(({ media, listener }) => media.removeEventListener?.('change', listener));
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('storage', onStorage);
      delete window.__muxuiThemeController;
    },
  };
  function onPageShow(event) {
    if (!event.persisted) return;
    state.modePreferences = readModePreferences();
    state.storageStatus = parseStoredTheme();
    state.activeTheme = state.storageStatus.theme;
    sync();
  }
  function onStorage(event) {
    if (event.key !== null && event.key !== APPLIED_THEME_KEY && event.key !== 'muxui-scale:mode-preferences:v1') return;
    if (event.key === null || event.key === APPLIED_THEME_KEY) {
      state.storageStatus = parseStoredTheme();
      state.activeTheme = state.storageStatus.theme;
    }
    if (event.key === null || event.key === 'muxui-scale:mode-preferences:v1') state.modePreferences = readModePreferences();
    sync();
  }
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('storage', onStorage);
  window.__muxuiThemeController = controller;
  return controller;
}
