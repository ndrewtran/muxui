export function colourStateSignatures(states, scheme) {
  return states
    .filter((entry) => entry.scheme === scheme)
    .map(({ state, scope }) => JSON.stringify([
      state.replace(/\b(?:light|dark)\b/giu, '<color-scheme>'),
      scope,
    ]))
    .sort();
}
