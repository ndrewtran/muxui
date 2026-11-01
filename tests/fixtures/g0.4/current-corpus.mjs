import { readFile } from 'node:fs/promises';
import { parseJsonStrict } from '../../../packages/schema/src/index.mjs';

function projectCurrentIdentity(value) {
  if (typeof value === 'string') {
    return value
      .replaceAll('core-ui', 'muxui')
      .replaceAll('Core UI', 'Mux UI')
      .replaceAll('core:', 'muxui:')
      .replaceAll('@core-ui/', '@muxui/')
      .replaceAll('coreVersion', 'muxuiVersion')
      .replaceAll('CORE_', 'MUXUI_');
  }
  if (Array.isArray(value)) return value.map(projectCurrentIdentity);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      projectCurrentIdentity(key),
      projectCurrentIdentity(item),
    ]));
  }
  return value;
}

/** The retained resolver corpus under the current product identity, with its older tuples intact. */
export async function currentCorpus() {
  return projectCurrentIdentity(parseJsonStrict(await readFile(new URL('corpus.json', import.meta.url), 'utf8')));
}
