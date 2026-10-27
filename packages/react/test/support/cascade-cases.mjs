// Stylesheet and markup changes that decide whether a role still paints a family's Basic example, each by an order, a condition, a
// fallback, a shadow or a shorthand that the cascade settles. These are hypothetical stylesheets: the static model cannot be complete
// against arbitrary CSS, and the authority for the real one is the Chromium sweep. For each case the generator's model makes a step
// for the role or does not (`claims`), and Chromium shows the role changing the target or not (`changes`). A claim must be a change; a
// case where `changes` is true and `claims` is false is the model declining to guess, which is the safe side. The static recipe test
// and the Chromium test both run this table, so the model and the browser see the same change.
import { withMirror } from './repository-mirror.mjs';
import { readStylingFacts, stylingFor } from './styling-reference.mjs';

const radius = 'var(--muxui-component-button-radius, var(--muxui-semantic-control-radius))';
const radiusRule = `  border-radius: ${radius};`;
const inRule = (rule, replacement) => (css) => {
  if (!css.includes(rule)) throw new Error('the rule that reads the role has changed');
  return css.replace(rule, replacement);
};
const prepended = (selector, declaration) => (css) => `@layer muxui.components {\n  ${selector} { ${declaration} }\n}\n${css}`;
const appended = (selector, declaration, wrap = (text) => text) => (css) => `${css}\n${wrap(`@layer muxui.components {\n  ${selector} { ${declaration} }\n}`)}\n`;

/** Button's radius role, read by `border-radius` on the Basic example's (danger) Button. */
const button = { family: 'button', role: '--muxui-component-button-radius', value: '24px', target: '.muxui-button', property: 'border-top-left-radius' };
/** Checkbox's selected background, which paints the selected indicator's border color. */
const checkbox = { family: 'checkbox', role: '--muxui-component-checkbox-selected-background', value: 'rgb(200, 0, 0)', target: '.muxui-checkbox__indicator[data-muxui-state-selected]', property: 'border-top-color' };
const important = 'border-radius: 2px !important;';

/** TextField's label role, read by `:where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label` and painted on the label's color. */
const field = { family: 'text-field', role: '--muxui-component-textfield-label', value: 'rgb(200, 0, 0)', target: '.muxui-field-label', property: 'color' };
/** The reader rewritten to a selector that is unknown on the first label (`:first-child`) and known on one that has the class `known`. */
const reader = ':where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label {';
const unknownReader = '.muxui-field-label:is(:first-child, .known) {';
const readerChange = (css) => {
  if (!css.includes(reader)) throw new Error('the rule that reads the role has changed');
  return css.replace(reader, unknownReader);
};
/** What beats the reader on every label that does not have the class `known`. */
const overridesOthers = (css) => appended('.muxui-field-label:not(.known)', 'color: rgb(0, 0, 255) !important;')(readerChange(css));
/** The Basic example's label is `.known` and the markup gets a second label that is not: the browser takes the first label, the model a known one. */
const knownLabelLast = (html) => html.replace(/<\/div>$/u, '<label class="muxui-field-label known">Again</label></div>');
const knownLabel = (html) => html.replace('class="muxui-field-label"', 'class="muxui-field-label known"');

/**
 * @typedef {object} CascadeCase
 * @property {string} name
 * @property {string} family The family whose Basic example is rendered.
 * @property {string} role The component role a wrapper assigns.
 * @property {string} value
 * @property {string} target The element the role paints, in the Basic example.
 * @property {string} property The longhand it paints on that element.
 * @property {(css: string) => string} change The stylesheet change.
 * @property {(html: string) => string} [markup] A change to the Basic example's markup.
 * @property {boolean} claims Whether the generator makes a step for the role.
 * @property {boolean} changes Whether Chromium shows the role changing the property of the target's first element.
 */

/** @type {CascadeCase[]} */
export const cascadeCases = [
  // Order and importance inside one rule.
  { ...button, name: 'a later shorthand beats an earlier longhand of the same rule', change: inRule(radiusRule, `  border-top-left-radius: ${radius};\n  border-radius: 2px;`), claims: false, changes: false },
  { ...button, name: 'an !important shorthand beats a later normal one of the same rule', change: inRule(radiusRule, `  border-radius: 2px !important;\n  border-radius: ${radius};`), claims: false, changes: false },
  { ...button, name: 'a later longhand beats an earlier shorthand of the same rule', change: inRule(radiusRule, `  border-radius: 2px;\n  border-top-left-radius: ${radius};`), claims: true, changes: true },
  { ...button, name: 'all: initial after the reader resets the radius', change: inRule(radiusRule, `${radiusRule}\n  all: initial;`), claims: false, changes: false },
  { ...button, name: 'all: initial before the reader leaves the radius to the role', change: inRule(radiusRule, `  all: initial;\n${radiusRule}`), claims: true, changes: true },
  // Order between rules: the same specificity, so the later rule wins whatever the declaration's place in its block.
  { ...button, name: 'a later rule of the same specificity beats the reader, though its declaration comes first in its block', change: appended('.muxui-button', 'border-radius: 2px;'), claims: false, changes: false },
  { ...button, name: 'an earlier rule of the same specificity loses to the reader', change: prepended('.muxui-button', 'border-radius: 2px;'), claims: true, changes: true },
  // Unknown pseudo-classes.
  { ...button, name: 'an !important rule behind :not(:disabled) applies to an enabled Button', change: appended('.muxui-button:not(:disabled)', important), claims: false, changes: false },
  { ...button, name: 'an !important rule behind :not(:hover) applies at rest', change: appended('.muxui-button:not(:hover)', important), claims: false, changes: false },
  { ...button, name: 'an !important rule behind :hover does not apply at rest', change: appended('.muxui-button:hover', important), claims: true, changes: true },
  { ...button, name: 'an !important rule behind :disabled does not apply to an enabled Button, and the model does not guess', change: appended('.muxui-button:disabled', important), claims: false, changes: true },
  { ...button, name: 'an !important rule behind :is(:disabled, .muxui-button) applies, through the branch that is known', change: appended('.muxui-button:is(:disabled, .muxui-button)', important), claims: false, changes: false },
  // How the role is read, and whether the wrapper's assignment reaches the reader.
  { ...button, name: 'a role that is only the fallback of another variable is not reached by the wrapper', change: inRule(radiusRule, '  border-radius: var(--muxui-semantic-control-radius, var(--muxui-component-button-radius));'), claims: false, changes: false },
  { ...button, name: 'a declaration of the role on the element itself shadows the wrapper\'s', change: appended('.muxui-button', '--muxui-component-button-radius: 8px;'), claims: false, changes: false },
  // At-rule conditions around the rule, and the components layer anywhere in the chain.
  { ...button, name: 'an !important rule in a components layer inside a forced-colors: none media query applies', change: appended('.muxui-button', important, (text) => `@media (forced-colors: none) {\n${text}\n}`), claims: false, changes: false },
  { ...button, name: 'an !important rule in a viewport media query that holds is unknown to the model', change: appended('.muxui-button', important, (text) => `@media (min-width: 1px) {\n${text}\n}`), claims: false, changes: false },
  { ...button, name: 'an !important rule in a viewport media query that does not hold is unknown to the model too', change: appended('.muxui-button', important, (text) => `@media (max-width: 1px) {\n${text}\n}`), claims: false, changes: true },
  { ...button, name: 'an !important rule in @supports is unknown to the model', change: appended('.muxui-button', important, (text) => `@supports (display: grid) {\n${text}\n}`), claims: false, changes: false },
  { ...button, name: 'an !important rule in a nested components layer is unknown to the model', change: appended('.muxui-button', important, (text) => text.replace(' {\n  .muxui-button', ' {\n  @layer muxui.components {\n  .muxui-button').replace('\n}', '\n}\n}')), claims: false, changes: false },
  { ...button, name: 'an !important rule in @scope is unknown to the model', change: (css) => `${css}\n@layer muxui.components {\n  @scope ([data-muxui-color-scheme]) {\n    .muxui-button { ${important} }\n  }\n}\n`, claims: false, changes: false },
  // Shorthands and logical properties that set the target.
  { ...checkbox, name: 'a logical shorthand on the block axis sets the physical top border color', change: appended('.muxui-checkbox__indicator', 'border-block-color: rgb(9, 9, 9) !important;'), claims: false, changes: false },
  { ...checkbox, name: 'a logical shorthand on the inline axis may set it in another writing mode, and the model does not guess', change: appended('.muxui-checkbox__indicator', 'border-inline-color: rgb(9, 9, 9) !important;'), claims: false, changes: true },
  { ...checkbox, name: 'the border-color shorthand sets the top border color', change: appended('.muxui-checkbox__indicator', 'border-color: rgb(9, 9, 9) !important;'), claims: false, changes: false },
  { ...checkbox, name: 'control: a logical shorthand that loses to the reader does not hide it', change: prepended('.muxui-checkbox__indicator', 'border-inline-color: rgb(9, 9, 9);'), claims: true, changes: true },
  { ...checkbox, name: 'control: a logical shorthand of the border width leaves the border color to the role', change: appended('.muxui-checkbox__indicator', 'border-block-width: 3px !important;'), claims: true, changes: true },
  { ...checkbox, name: 'all: initial in a later important rule resets the border color', change: appended('.muxui-checkbox__indicator', 'all: initial !important;'), claims: false, changes: false },
  // Which element of several decides: a reader that is unknown on an earlier element than the one it is known to match.
  { ...field, name: 'a reader that the first label may match through :first-child is unknown there, so a later label that matches it for sure is not a step', target: '.muxui-field-label:is(:first-child, .known)', change: overridesOthers, markup: knownLabelLast, claims: false, changes: false },
  { ...field, name: 'control: the same reader on a label that is known to match it, and nothing that beats it there, is a step', target: '.muxui-field-label:is(:first-child, .known)', change: overridesOthers, markup: knownLabel, claims: true, changes: true },
];

/**
 * Whether the generator makes a token step for the case's role on the case's target and property (another reader of the role can still
 * make a step elsewhere), on the real repository with the case's stylesheet and markup.
 * @param {CascadeCase} one
 * @param {{ root: string, artifact: object, observations: import('./styling-reference.mjs').Observation[] }} context
 */
export const claimsStep = ({ family, role, target, property, change, markup = (html) => html }, { root, artifact, observations }) => withMirror(root, { 'packages/react/generated/styles.css': change }, async (directory) => {
  const basic = observations.find((observation) => observation.family === family && observation.source.endsWith('/basic.tsx'));
  const swapped = observations.map((observation) => (observation === basic ? { ...observation, html: markup(observation.html) } : observation));
  const examples = observations.filter((observation) => observation.family === family).map(({ source }) => ({ source: { content: source } }));
  return stylingFor({ slug: family, artifact, examples, facts: await readStylingFacts(directory), observations: swapped })
    .recipe.steps.some((step) => step.declaration.startsWith(`${role}:`) && step.target === target && step.property === property);
});
