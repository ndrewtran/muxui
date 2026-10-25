import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { launchBrowser } from './harness.mjs';

// Rules of equal specificity from different authored files are decided by the order the generator emits the files
// in. This test builds one element for each tie, so both rules match it, and reads the computed value that only
// the later rule produces. Then it swaps the two files' chunks in the built stylesheet and requires the same
// assertion to fail, so the assertion is proved to depend on the order and not on a value both rules share.
// Chromium only, one launch, no server: the fixtures are static markup under the published stylesheet.
const packageRoot = resolve(import.meta.dirname, '../..');
const styles = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
const chunk = async (path) => (await readFile(resolve(packageRoot, 'src', path), 'utf8')).trim();

const checks = {
  padding: 'small IconButton padding: the shared block follows icon-button.css',
  chipIcon: 'chip-remove icon size: the shared block follows text-editor.css',
  iconButtonFont: 'sm IconButton font size: the shared block follows components.css',
  lightboxFont: 'sm Lightbox close font size: lightbox.css follows components.css',
  lightboxPadding: 'sm Lightbox close padding: lightbox.css follows components.css',
};

// Each swap puts the later file's chunk where the earlier one is, so the earlier rule now wins the tie.
const swaps = [
  { earlier: 'supplemental/icon-button.css', later: 'supplemental/styles.css', fails: [checks.padding] },
  { earlier: 'text-editor/text-editor.css', later: 'supplemental/styles.css', fails: [checks.chipIcon] },
  { earlier: 'styles/components.css', later: 'supplemental/styles.css', fails: [checks.iconButtonFont] },
  { earlier: 'styles/components.css', later: 'supplemental/lightbox.css', fails: [checks.lightboxFont, checks.lightboxPadding] },
];

function swapChunks(css, earlier, later) {
  const first = css.indexOf(earlier);
  const second = css.indexOf(later);
  assert.ok(first >= 0 && second > first, 'both chunks are in the built stylesheet, the earlier one first');
  return css.slice(0, first) + later + css.slice(first + earlier.length, second) + earlier + css.slice(second + later.length);
}

const fixture = (css) => `<!doctype html><html><head><style>${css}</style></head><body>
  <button id="icon-button" class="muxui-button muxui-icon-button" data-muxui-icon-button data-size="sm">x</button>
  <span id="chip" class="muxui-text-editor__btn muxui-command-palette__chip-remove"><span class="muxui-icon-button-icon"></span></span>
  <button id="lightbox-close" class="muxui-button muxui-lightbox-close" data-size="sm">x</button>
</body></html>`;

// Runs in the page. `winner` is what the later rule gives and `loser` what the earlier one gives; they must differ,
// or the check could not tell the two orders apart.
function observe() {
  const probe = (property, value) => {
    const node = document.createElement('span');
    node.style.setProperty(property, value);
    document.body.append(node);
    const resolved = getComputedStyle(node).getPropertyValue(property);
    node.remove();
    return resolved;
  };
  const style = (selector) => getComputedStyle(document.querySelector(selector));
  const labelM = 'var(--muxui-semantic-typography-label-m-font-size)';
  const labelS = 'var(--muxui-semantic-typography-label-s-font-size)';
  return [
    ['padding', style('#icon-button').paddingLeft, probe('padding-left', 'var(--muxui-semantic-layout-inset-tight)'), probe('padding-left', '0')],
    ['chipIcon', style('#chip .muxui-icon-button-icon').width, probe('width', '0.875rem'), probe('width', '1rem')],
    ['iconButtonFont', style('#icon-button').fontSize, probe('font-size', labelM), probe('font-size', labelS)],
    ['lightboxFont', style('#lightbox-close').fontSize, probe('font-size', labelM), probe('font-size', labelS)],
    ['lightboxPadding', style('#lightbox-close').paddingLeft, probe('padding-left', 'var(--muxui-semantic-layout-inset-tight)'), probe('padding-left', 'var(--muxui-semantic-layout-inset-small)')],
  ].map(([key, observed, winner, loser]) => ({ key, observed, winner, loser }));
}

test('equal-specificity rules from different files resolve by the order the built stylesheet emits them', { timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // The names of the checks that fail, including any whose two orders would give the same value.
    const failures = async (css) => {
      await page.setContent(fixture(css));
      return (await page.evaluate(observe)).flatMap(({ key, observed, winner, loser }) => (winner === loser || observed !== winner ? [checks[key]] : []));
    };
    assert.deepEqual(await failures(styles), []);
    for (const { earlier, later, fails } of swaps) {
      const broken = await failures(swapChunks(styles, await chunk(earlier), await chunk(later)));
      for (const name of fails) assert.ok(broken.includes(name), `swapping ${earlier} and ${later} must fail "${name}"`);
    }
  } finally {
    await browser.close();
  }
});
