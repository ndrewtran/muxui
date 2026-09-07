/**
 * Build the current finite-capture donor entry from the sealed historical
 * adapter without changing its source or its retained provenance digest.
 * The returned module is written to a disposable directory by the capture
 * runner and is never imported by normal generation or Storybook checks.
 */
export function createFiniteDonorEntrySource(historicalSource, { appRoot }) {
  const contractImport = `from '../../src/visual-migration-contract.mjs';`;
  const rewrittenImport = `from '/@fs/${appRoot}/src/visual-migration-contract.mjs';`;
  const renderPlanImport = `from './donor-render-plan.mjs';`;
  // The retained plan is checksum-bound to historical capture. Finite capture
  // deliberately imports the disposable R1.6 projection instead.
  const rewrittenRenderPlanImport = `from '/@fs/${appRoot}/visual-migration/bootstrap/r1-6-original-donor-render-plan.mjs';`;
  if (!historicalSource.includes(contractImport) || !historicalSource.includes(renderPlanImport)) {
    throw new Error('sealed donor entry no longer matches the finite adapter source contract');
  }
  const withAbsoluteImports = historicalSource
    .replace(contractImport, rewrittenImport)
    .replace(renderPlanImport, rewrittenRenderPlanImport)
    // The retained donor bootstrap forced system-ui for historical captures.
    // Current finite proof loads the approved local font faces in both pages,
    // so leave the donor's component CSS in control of family selection.
    .replace('  document.documentElement.style.fontFamily = migrationFrame.fontFamily;\n  document.body.style.fontFamily = migrationFrame.fontFamily;\n', '');
  const helperImport = `import { lifecycleFactsForOriginalFinite, stateReachedForOriginalFinite, styleFactsForOriginalFinite } from '/@fs/${appRoot}/visual-migration/bootstrap/r1-6-original-finite-facts.mjs';\n`;
  const stateStart = 'function stateAssertion(entry) {';
  const stateEnd = '\nfunction requiredPartAssertion(entry) {';
  const factsStart = 'function styleFacts(entry) {';
  const factsEnd = '\nfunction Case({ entry }) {';
  const replaceFunction = (source, start, end, replacement) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`sealed donor entry function contract changed: ${start}`);
    return `${source.slice(0, from)}${replacement}${source.slice(to)}`;
  };
  const withFiniteHelpers = replaceFunction(
    replaceFunction(
      `${helperImport}${withAbsoluteImports}`,
      stateStart,
      stateEnd,
      `function stateAssertion(entry) {\n  return stateReachedForOriginalFinite(document.querySelector(\`[data-migration-case="\${CSS.escape(entry.id)}"]\`), entry.state, 'donor', entry.component);\n}\n`,
    ),
    factsStart,
    factsEnd,
    `function styleFacts(entry) {\n  return styleFactsForOriginalFinite(document.querySelector(\`[data-migration-case="\${CSS.escape(entry.id)}"]\`), entry.component, entry.state, 'donor');\n}\n`,
  ).replace(
    "  const props = { className: 'migration-tale-root' };",
    "  const props = { ...entry.props, className: 'migration-tale-root' };",
  );
  const withFiniteFixture = withFiniteHelpers.replace(
    'import { equivalentPartSelectorsFor, migrationCases, migrationFrame, sharedFixtureInput }',
    'import { equivalentPartSelectorsFor, fixtureContractFor, migrationCases, migrationFrame, sharedFixtureInput }',
  ).replace(
    '  const fixture = sharedFixtureInput(entry);',
    '  const fixture = entry.fixture ?? sharedFixtureInput(entry);',
  );
  const disclosureImport = "import * as DisclosurePackage from '@tale-ui/react/disclosure';";
  const accordionImport = "import * as AccordionPackage from '@tale-ui/react/accordion';";
  const disclosureGroupPackage = '  DisclosureGroup: DisclosurePackage.Disclosure,';
  const accordionGroupPackage = '  DisclosureGroup: AccordionPackage.Accordion,';
  if (!withFiniteFixture.includes(disclosureImport) || !withFiniteFixture.includes(disclosureGroupPackage)) {
    throw new Error('sealed donor entry DisclosureGroup contract changed');
  }
  const withFiniteDisclosureGroup = withFiniteFixture
    .replace(disclosureImport, `${disclosureImport}\n${accordionImport}`)
    .replace(disclosureGroupPackage, accordionGroupPackage);
  const runtimeTimeParser = '    parseFixtureDate,\n    renderCalendar,';
  const rewrittenRuntimeTimeParser = '    parseFixtureDate,\n    parseFixtureTime: (value) => parseTime(value),\n    renderCalendar,';
  if (!withFiniteDisclosureGroup.includes(runtimeTimeParser)) throw new Error('sealed donor entry runtime contract no longer exposes date parsing');
  const historicalToastHarness = `function ToastHarness({ copy }) {
  const [queue] = React.useState(() => ToastPackage.createToastQueue());
  React.useEffect(() => {
    queue.add({ title: copy, description: copy });
  }, [copy, queue]);
  return h(ToastPackage.ToastRegion, { queue });
}`;
  const finiteToastHarness = `function ToastHarness({ copy, variant, duration }) {
  const [queue] = React.useState(() => ToastPackage.createToastQueue());
  React.useEffect(() => {
    // Mux accepts the catalog's info value but its stylesheet only gives
    // neutral/success/warning/danger a treatment. Tale's public queue rejects
    // info, so neutral is the direct visual donor equivalent.
    const donorVariant = variant === 'info' ? 'neutral' : variant;
    queue.add({ title: copy, description: copy, variant: donorVariant }, duration === undefined ? undefined : { timeout: duration });
  }, [copy, duration, queue, variant]);
  return h(ToastPackage.ToastRegion, { queue });
}`;
  const withFiniteRuntime = withFiniteDisclosureGroup.replace(runtimeTimeParser, rewrittenRuntimeTimeParser);
  if (!withFiniteRuntime.includes(historicalToastHarness)) throw new Error('sealed donor entry ToastHarness contract changed');
  const withFiniteToastHarness = withFiniteRuntime.replace(historicalToastHarness, finiteToastHarness);
  const lifecycleSlot = '    styleFacts: () => styleFacts(entry),';
  const finiteLifecycleSlot = `    styleFacts: () => styleFacts(entry),
    lifecycle: () => lifecycleFactsForOriginalFinite(document.querySelector(\`[data-migration-case="\${CSS.escape(entry.id)}"]\`), entry.state, 'donor'),`;
  if (!withFiniteToastHarness.includes(lifecycleSlot)) throw new Error('sealed donor entry lifecycle contract changed');
  const withFiniteLifecycle = withFiniteToastHarness.replace(lifecycleSlot, finiteLifecycleSlot);
  const historicalLookup = '  const entry = migrationCases.find((candidate) => candidate.id === id);\n  if (!entry) throw new Error(`unknown canonical migration case: ${id}`);';
  const finiteLookup = `  const historicalEntry = migrationCases.find((candidate) => candidate.id === id);
  const finite = params.get('finite') === '1';
  const family = params.get('family');
  const state = params.get('state') ?? 'idle';
  const props = params.get('props') ? JSON.parse(params.get('props')) : {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new TypeError('finite donor props must be a JSON object');
  const baseFixture = finite && family ? fixtureContractFor({ family }, state) : undefined;
  const fixture = baseFixture && { ...baseFixture, state, frame: family === 'Virtualizer'
    ? { ...baseFixture.frame, virtualizer: { ...baseFixture.frame.virtualizer, height: props.height ?? baseFixture.frame.virtualizer.height } }
    : baseFixture.frame };
  const entry = finite && family
    ? { id, component: family, state, props, fixture }
    : historicalEntry;
  if (!entry) throw new Error('unknown canonical migration case: ' + id);`;
  if (!withFiniteLifecycle.includes(historicalLookup)) throw new Error('sealed donor entry lookup contract changed');
  return withFiniteLifecycle.replace(historicalLookup, finiteLookup);
}
