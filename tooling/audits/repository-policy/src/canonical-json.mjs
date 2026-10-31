function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortJson(value[key])]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('CANONICAL_JSON_NONFINITE: evidence JSON cannot contain non-finite numbers');
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortJson(value));
}
