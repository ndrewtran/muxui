import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  applicableMigrationRecords,
  canonicalStateCoverage,
  compatibilityStateCoverage,
  equivalentPartSelectorsFor,
  migrationCases,
  migrationFrame,
  migrationQuery,
  migrationStoryId,
  stateCoverage,
  supplementalStateCoverage,
  sharedFixtureInput,
} from '../../src/visual-migration-contract.mjs';
import { fixtureMapSourcePath } from '../../src/visual-migration-fixture-map.mjs';

export const pinnedDonor = Object.freeze({
  name: 'Tale UI',
  repository: 'https://github.com/Tale-UI/tale-ui',
  commit: '94bf62a26c02605c8928dfeb24f0ddc4be1c92fd',
});

export const donorAdapterSourcePath = 'visual-migration/bootstrap/donor-adapter.mjs';
export const donorEntrySourcePath = 'visual-migration/bootstrap/donor-entry.mjs';
export const donorRenderPlanSourcePath = 'visual-migration/bootstrap/donor-render-plan.mjs';
export const donorCaptureSourcePath = 'visual-migration/bootstrap/capture.mjs';
export { fixtureMapSourcePath };

/**
 * This is deliberately the renderer-specific part of the one-time migration.
 * It is never imported by routine Storybook checks. `capture.mjs` loads it
 * after the caller supplies an explicit, pinned Tale checkout root.
 */
export const donorAdapterProvenance = Object.freeze({
  schema: 'core-ui-react-visual-migration-donor-adapter-v2',
  renderer: 'pinned external donor React adapter',
  storyId: migrationStoryId,
  query: migrationQuery,
  frame: migrationFrame,
  familyCount: applicableMigrationRecords.length,
  caseCount: migrationCases.length,
  canonicalStateCount: canonicalStateCoverage.length,
  compatibilityStateCount: compatibilityStateCoverage.length,
  supplementalStateCount: supplementalStateCoverage.length,
  stateCoverageCount: stateCoverage.length,
  stateDispositions: Object.fromEntries([...new Set(stateCoverage.map(({ disposition }) => disposition))].sort().map((disposition) => [disposition, stateCoverage.filter((entry) => entry.disposition === disposition).length])),
  taleImportBoundary: 'vite aliases @tale-ui/react/* and @tale-ui/react-styles to the supplied --tale-root only',
  renderPlanSource: donorRenderPlanSourcePath,
  mapping: Object.freeze(applicableMigrationRecords.map(({ family, slug, binding }) => Object.freeze({
    family,
    slug,
    coreParts: Object.freeze([...binding.api.parts]),
    coreProps: Object.freeze([...binding.api.props]),
    states: Object.freeze([...binding.states]),
    equivalentParts: Object.freeze(equivalentPartSelectorsFor(family)),
    mappingRule: 'same fixture copy/data/state/frame; renderer-specific Tale component anatomy and semantic-part selectors',
  }))),
});

export function donorSemanticSelectors(family, state) {
  if (family === 'DatePicker' && state === 'open') return { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-date-picker__trigger', '.tale-date-picker__popover', '.tale-date-picker__dialog', '.tale-calendar'] };
  if (family === 'DateRangePicker' && state === 'open') return { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-date-range-picker__trigger', '.tale-date-range-picker__popover', '.tale-date-range-picker__dialog', '.tale-range-calendar'] };
  if (family === 'ComboBox' && state === 'open') return { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-combobox__trigger', '.tale-combobox__popover', '.tale-combobox__item'] };
  if (family === 'Select' && state === 'open') return { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-select__trigger', '.tale-select__popover', '.tale-select__item'] };
  if (family === 'Dialog') return state === 'open'
    ? { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-dialog__backdrop', '.tale-dialog__popup', '.tale-button'] }
    : { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-button'] };
  if (family === 'Popover') return state === 'open'
    ? { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-popover__popup', '.tale-button'] }
    : { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-button'] };
  if (family === 'PreviewTrigger') return state === 'open'
    ? { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-preview-card__trigger', '.tale-preview-card__popup'] }
    : { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-preview-card__trigger'] };
  if (family === 'Toast') return { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-toast-region', '.tale-toast'] };
  if (family === 'Tooltip') return state === 'open'
    ? { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-tooltip__popup', '.tale-tooltip__trigger'] }
    : { capture: 'viewport', selector: 'body', requiredSelectors: ['.tale-tooltip__trigger'] };
  return { capture: 'component', selector: '.migration-component', requiredSelectors: ['.migration-component'] };
}

export function donorActionFor(entry) {
  if (!entry?.action) return undefined;
  const selector = entry.action.selector
    .replace('.muxui-date-trigger', entry.component === 'DateRangePicker' ? '.tale-date-range-picker__trigger' : '.tale-date-picker__trigger')
    .replace('.muxui-combo-box-trigger', '.tale-combobox__trigger')
    .replace('.muxui-select-trigger', '.tale-select__trigger')
    .replace('.core-date-trigger', entry.component === 'DateRangePicker' ? '.tale-date-range-picker__trigger' : '.tale-date-picker__trigger')
    .replace('.core-combo-box-trigger', '.tale-combobox__trigger')
    .replace('.core-select-trigger', '.tale-select__trigger');
  return { ...entry.action, selector };
}

/** Return the canonical fixture consumed by the Tale browser adapter. */
export { sharedFixtureInput };

/** The source file is retained and hashed in donor provenance for review. */
export async function readDonorSource(root, sourcePath) {
  return readFile(resolve(root, sourcePath));
}
