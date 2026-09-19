/** Shared Mux UI geometry validation for anchored overlays. */
const OVERLAY_PLACEMENTS = new Set([
  'top', 'bottom', 'start', 'end',
  'top-start', 'top-end', 'bottom-start', 'bottom-end',
  'start-top', 'start-bottom', 'end-top', 'end-bottom',
]);

function normalizePlacement(value, fallback, name) {
  const normalized = value === undefined ? fallback : value;
  if (!OVERLAY_PLACEMENTS.has(normalized)) throw new TypeError(`${name} must use a supported side or logical alignment`);
  return normalized.replace('-', ' ');
}

function normalizeFinite(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

export function normalizeNonNegativeFinite(value, fallback, name) {
  const normalized = normalizeFinite(value, fallback, name);
  if (normalized < 0) throw new TypeError(`${name} must be nonnegative`);
  return normalized;
}

export function normalizeBoolean(value, fallback, name) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return value;
}

export function overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, defaults, name) {
  return {
    placement: normalizePlacement(placement, defaults.placement, name),
    offset: normalizeFinite(offset, defaults.offset, `${name} offset`),
    crossOffset: normalizeFinite(crossOffset, defaults.crossOffset, `${name} crossOffset`),
    shouldFlip: normalizeBoolean(shouldFlip, defaults.shouldFlip, `${name} shouldFlip`),
    containerPadding: normalizeNonNegativeFinite(containerPadding, defaults.containerPadding, `${name} containerPadding`),
  };
}
