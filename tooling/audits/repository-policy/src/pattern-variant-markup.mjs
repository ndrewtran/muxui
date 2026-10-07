// What a pattern variant must render for its packed SSR and hydration proof to
// mean anything. A variant that server-renders nothing hydrates "cleanly", so the
// packed proof (`pattern-variant-proof.mjs`) and release preparation both assert
// these counts after hydration. The counts are `[role="row"]` elements the
// hydration tool reports for the server markup and for the hydrated tree under a
// measured layout. Each bound is an inclusive `[min, max]`; an omitted one is not
// checked.
const rowExpectations = {
  // All 12 cards render on the server and hydrate in place.
  'muxui:example:poster-grid-css-grid': { serverRows: [12, 12], hydratedRows: [12, 12] },
  // The server shell is empty by design: a Virtualizer mounts rows from a measured
  // scroller, which a server lacks (the browser test proves the rows). Rows must
  // mount once hydration has a measured layout, and only a window of the 1,000 cards.
  'muxui:example:poster-grid-virtualized': { hydratedRows: [1, 999] },
};

/** The variant ids that carry a row expectation, so a test can catch a stale entry. */
export const expectedRowVariantIds = Object.keys(rowExpectations);

const withinBounds = (count, [min, max]) => count >= min && count <= max;

/**
 * Asserts a variant's server markup (`html`) and hydration counts (`serverRows`,
 * `hydratedRows`) are meaningful. Every variant must render Mux UI markup on the
 * server; a variant with a row expectation must also meet it. `fail(code, detail)`
 * raises the caller's error.
 */
export function assertPatternVariantMarkup({ variantId, html, serverRows, hydratedRows, fail }) {
  const expected = rowExpectations[variantId];
  if (typeof html !== 'string' || !html.includes('class="muxui-')) {
    fail('MUXUI_PATTERN_VARIANT_PROOF_EMPTY', `${variantId} rendered no Mux UI markup from the packed package`);
  }
  for (const [name, count] of [['serverRows', serverRows], ['hydratedRows', hydratedRows]]) {
    const bounds = expected?.[name];
    if (bounds && !(Number.isInteger(count) && withinBounds(count, bounds))) {
      fail('MUXUI_PATTERN_VARIANT_PROOF_EMPTY', `${variantId} rendered ${count} role="row" elements for ${name}, expected ${bounds[0] === bounds[1] ? bounds[0] : `${bounds[0]} to ${bounds[1]}`}`);
    }
  }
}
