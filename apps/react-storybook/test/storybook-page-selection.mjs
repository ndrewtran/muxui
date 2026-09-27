import assert from 'node:assert/strict';
import manifest from '../.storybook/generated/manifest.mjs';
import { selectedStorybookFamilies } from './storybook-family-selection.mjs';

const proofModes = new Set(['story', 'component', 'theme', 'chrome', 'full']);
const pageIndex = manifest.pageIndex;

function selectedStoryIds(environment) {
  const raw = environment.MUXUI_STORYBOOK_STORY_IDS;
  if (raw === undefined) return null;
  const values = raw.split(',').map((value) => value.trim());
  if (values.some((value) => !value)) {
    throw new Error('MUXUI_STORYBOOK_STORY_IDS_EMPTY: provide non-empty Storybook index IDs');
  }
  if (new Set(values).size !== values.length) {
    throw new Error('MUXUI_STORYBOOK_STORY_IDS_DUPLICATE: remove repeated Storybook index IDs');
  }
  return values;
}

function flattenPageIndex(families = pageIndex) {
  return families.flatMap(({ family, storyFile, stories }) => stories.map((story) => ({
    ...story,
    family,
    storyFile,
  })));
}

function selectionLabel({ proof, families, pages }) {
  if (proof === 'full') return 'full package audit';
  if (proof === 'theme') {
    const scope = families.length ? families.join(', ') : 'all consumer families';
    return `theme colour and contrast proof for ${scope} (${pages.length} pages)`;
  }
  if (proof === 'chrome') return 'Storybook manager and docs chrome';
  if (proof === 'component') return `component families: ${families.join(', ')}`;
  return `story pages: ${pages.map(({ id }) => id).join(', ')}`;
}

export function resolveStorybookPageSelection(environment = process.env) {
  assert.ok(Array.isArray(pageIndex) && pageIndex.length > 0, 'generated Storybook page index must be available');
  const familySelection = selectedStorybookFamilies(environment);
  const requestedIds = selectedStoryIds(environment);
  let proof = environment.MUXUI_STORYBOOK_AUDIT_PROOF;
  if (proof === undefined) {
    proof = requestedIds ? 'story' : familySelection ? 'component' : 'full';
  }
  if (!proofModes.has(proof)) {
    throw new Error(`MUXUI_STORYBOOK_AUDIT_PROOF_UNKNOWN: expected ${[...proofModes].join('|')}, got ${proof}`);
  }

  const allPages = flattenPageIndex();
  const pagesById = new Map(allPages.map((page) => [page.id, page]));
  assert.equal(pagesById.size, allPages.length, 'generated Storybook page IDs must be unique');
  let families = familySelection ?? [];
  let pages = [];

  if (proof === 'story') {
    if (!familySelection?.length || !requestedIds?.length) {
      throw new Error('MUXUI_STORYBOOK_STORY_SELECTION_REQUIRED: story proof needs both families and exact story IDs');
    }
    const unknown = requestedIds.filter((id) => !pagesById.has(id));
    if (unknown.length) throw new Error(`MUXUI_STORYBOOK_STORY_ID_UNKNOWN: ${unknown.join(', ')}`);
    pages = requestedIds.map((id) => pagesById.get(id));
    const selectedFamilySet = new Set(familySelection);
    const mismatched = pages.filter(({ family }) => !selectedFamilySet.has(family));
    if (mismatched.length) {
      throw new Error(`MUXUI_STORYBOOK_STORY_FAMILY_MISMATCH: ${mismatched.map(({ id, family }) => `${id} (${family})`).join(', ')}`);
    }
    const missingFamilies = familySelection.filter((family) => !pages.some((page) => page.family === family));
    if (missingFamilies.length) {
      throw new Error(`MUXUI_STORYBOOK_STORY_FAMILY_UNUSED: no selected page belongs to ${missingFamilies.join(', ')}`);
    }
  } else if (proof === 'component') {
    if (!familySelection?.length) {
      throw new Error('MUXUI_STORYBOOK_FAMILIES_REQUIRED: component proof needs one or more families');
    }
    if (requestedIds !== null) {
      throw new Error('MUXUI_STORYBOOK_STORY_IDS_UNEXPECTED: component proof selects every page in its families');
    }
    pages = allPages.filter(({ family }) => familySelection.includes(family));
    if (!pages.length) throw new Error('MUXUI_STORYBOOK_COMPONENT_SELECTION_EMPTY: selected families have no pages');
  } else if (proof === 'theme') {
    const consumerPages = allPages.filter(({ exportName }) => exportName !== 'BrowserProof');
    if (requestedIds !== null && !familySelection?.length) {
      throw new Error('MUXUI_STORYBOOK_THEME_STORY_SELECTION_REQUIRED: exact theme page IDs need families');
    }
    if (requestedIds) {
      const unknown = requestedIds.filter((id) => !pagesById.has(id));
      if (unknown.length) throw new Error(`MUXUI_STORYBOOK_STORY_ID_UNKNOWN: ${unknown.join(', ')}`);
      pages = requestedIds.map((id) => pagesById.get(id));
      const selectedFamilySet = new Set(familySelection);
      const mismatched = pages.filter(({ family }) => !selectedFamilySet.has(family));
      if (mismatched.length) {
        throw new Error(`MUXUI_STORYBOOK_STORY_FAMILY_MISMATCH: ${mismatched.map(({ id, family }) => `${id} (${family})`).join(', ')}`);
      }
      const missingFamilies = familySelection.filter((family) => !pages.some((page) => page.family === family));
      if (missingFamilies.length) {
        throw new Error(`MUXUI_STORYBOOK_STORY_FAMILY_UNUSED: no selected page belongs to ${missingFamilies.join(', ')}`);
      }
      const behaviorPages = pages.filter(({ exportName }) => exportName === 'BrowserProof');
      if (behaviorPages.length) {
        throw new Error(`MUXUI_STORYBOOK_THEME_BEHAVIOR_PAGE_UNSUPPORTED: ${behaviorPages.map(({ id }) => id).join(', ')}`);
      }
    } else if (familySelection) {
      pages = consumerPages.filter(({ family }) => familySelection.includes(family));
    } else {
      families = [...new Set(consumerPages.map(({ family }) => family))];
      pages = consumerPages;
    }
    if (!pages.length) throw new Error('MUXUI_STORYBOOK_THEME_SELECTION_EMPTY: selected theme scope has no consumer pages');
    if (!families.length) families = [...new Set(pages.map(({ family }) => family))];
  } else if (proof === 'chrome') {
    if (familySelection !== null || requestedIds !== null) {
      throw new Error('MUXUI_STORYBOOK_CHROME_FILTER_UNEXPECTED: chrome proof does not select stories');
    }
  } else if (proof === 'full' && (familySelection !== null || requestedIds !== null)) {
    throw new Error('MUXUI_STORYBOOK_FULL_FILTER_UNEXPECTED: full package proof does not accept page filters');
  }

  return { proof, families, pages, label: selectionLabel({ proof, families, pages }) };
}

export function validateRuntimeStoryPages(selection, index) {
  const entries = Object.values(index?.entries ?? {}).filter(({ type }) => type === 'story');
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  if (entriesById.size !== entries.length) throw new Error('Storybook index contains duplicate story IDs');
  for (const page of selection.pages) {
    const entry = entriesById.get(page.id);
    if (!entry) throw new Error(`MUXUI_STORYBOOK_RUNTIME_PAGE_MISSING: ${page.id} (${page.family})`);
    const runtimeFamily = entry.title?.split('/').at(-1);
    if (runtimeFamily !== page.family) {
      throw new Error(`MUXUI_STORYBOOK_RUNTIME_PAGE_FAMILY_MISMATCH: ${page.id} expected ${page.family}, got ${runtimeFamily ?? 'unknown'}`);
    }
    if (entry.name !== page.name) {
      throw new Error(`MUXUI_STORYBOOK_RUNTIME_PAGE_NAME_MISMATCH: ${page.id} expected ${page.name}, got ${entry.name ?? 'unknown'}`);
    }
  }
  return selection.pages.map((page) => entriesById.get(page.id));
}
