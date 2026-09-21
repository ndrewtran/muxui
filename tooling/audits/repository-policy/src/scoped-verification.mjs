import { readFile } from 'node:fs/promises';

const LOCAL_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function splitValues(value) {
  const values = String(value).split(',').map((entry) => entry.trim());
  if (values.some((entry) => !entry)) {
    throw new Error('MUXUI_TASK_OPTION_VALUE_REQUIRED: selector values cannot be empty');
  }
  return values;
}

function valueFor(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`MUXUI_TASK_OPTION_VALUE_REQUIRED: ${flag} expects a value`);
  }
  return value;
}

/** Parse the small root task interface without forwarding selectors to pnpm. */
export function parseTaskArguments(args) {
  const [task, ...options] = args;
  if (!task) throw new Error('TASK_REQUIRED: pass a package-owned task name');

  const parsed = {
    task,
    affected: false,
    full: false,
    generate: false,
    preview: false,
    components: [],
    packages: [],
    files: [],
  };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--affected') {
      parsed.affected = true;
      continue;
    }
    if (option === '--generate') {
      parsed.generate = true;
      continue;
    }
    if (option === '--full') {
      parsed.full = true;
      continue;
    }
    if (option === '--preview' || option === '--dry-run') {
      parsed.preview = true;
      continue;
    }
    const match = option.match(/^(--component|--package|--files)(?:=(.*))?$/u);
    if (match) {
      const [, flag, inlineValue] = match;
      if (inlineValue === '') throw new Error(`MUXUI_TASK_OPTION_VALUE_REQUIRED: ${flag} expects a value`);
      const value = inlineValue ?? valueFor(options, index++, flag);
      const target = flag === '--component'
        ? parsed.components
        : flag === '--package'
          ? parsed.packages
          : parsed.files;
      target.push(...splitValues(value));
      continue;
    }
    throw new Error(`MUXUI_TASK_OPTION_UNKNOWN: ${option}`);
  }
  return {
    ...parsed,
    components: [...new Set(parsed.components)],
    packages: [...new Set(parsed.packages)],
    files: [...new Set(parsed.files)],
  };
}

function localDependencies(manifest) {
  return [...new Set(LOCAL_DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})))];
}

export function dependencyClosure(packages, names) {
  const byName = new Map(packages.map((item) => [item.name, item]));
  const selected = new Set();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.shift();
    if (selected.has(name)) continue;
    const item = byName.get(name);
    if (!item) continue;
    selected.add(name);
    queue.push(...localDependencies(item.manifest));
  }
  return packages.filter(({ name }) => selected.has(name));
}

export function dependentClosure(packages, names) {
  const dependents = new Map(packages.map(({ name }) => [name, []]));
  for (const item of packages) {
    for (const dependency of localDependencies(item.manifest)) {
      if (!dependents.has(dependency)) continue;
      dependents.get(dependency).push(item.name);
    }
  }
  const selected = new Set();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.shift();
    if (selected.has(name)) continue;
    selected.add(name);
    queue.push(...(dependents.get(name) ?? []));
  }
  return packages.filter(({ name }) => selected.has(name));
}

function packageForPath(packages, path) {
  return packages
    .filter(({ path: packagePath }) => path === packagePath || path.startsWith(`${packagePath}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function resolvePackage(packages, value) {
  const normalized = value.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/package\.json$/u, '');
  const matches = packages.filter((item) => item.name === value
    || item.path === normalized
    || item.path.endsWith(`/${normalized}`)
    || item.name === `@muxui/${normalized}`);
  if (matches.length === 0) throw new Error(`MUXUI_PACKAGE_UNKNOWN: ${value}`);
  if (matches.length > 1) throw new Error(`MUXUI_PACKAGE_AMBIGUOUS: ${value}`);
  return matches[0];
}

function normalizeComponent(value) {
  return value.trim().replace(/\\/gu, '/').replace(/^muxui:component:/u, '').replace(/#web\.react$/u, '').toLowerCase();
}

/** Resolve component slugs/family names from the generated canonical contract. */
export function resolveComponents(requested, familyRecords) {
  const byKey = new Map();
  for (const record of familyRecords) {
    for (const key of [record.family, record.slug, record.export, record.name].filter(Boolean)) {
      byKey.set(normalizeComponent(key), record);
    }
  }
  const records = [];
  for (const requestedValue of requested) {
    const record = byKey.get(normalizeComponent(requestedValue));
    if (!record) throw new Error(`MUXUI_COMPONENT_UNKNOWN: ${requestedValue}`);
    if (!records.some(({ slug }) => slug === record.slug)) records.push(record);
  }
  return records;
}

// These families share the same calendar/date interaction surface. The groups
// are routing metadata only; family ownership remains in the generated contract.
const SHARED_FAMILY_GROUPS = Object.freeze([
  ['Calendar', 'RangeCalendar', 'DateField', 'DatePicker', 'DateRangePicker'],
]);

export function expandRelatedFamilies(records, selected) {
  const selectedNames = new Set(selected.map(({ family }) => family));
  for (const group of SHARED_FAMILY_GROUPS) {
    if (group.some((family) => selectedNames.has(family))) {
      for (const family of group) selectedNames.add(family);
    }
  }
  return records.filter(({ family }) => selectedNames.has(family));
}

function matchesPath(path, patterns) {
  return patterns.some((pattern) => pattern.endsWith('/')
    ? path.startsWith(pattern)
    : path === pattern);
}

function ownerPackagesForPath(path, packages, policy) {
  const direct = packageForPath(packages, path);
  if (direct) return [direct.name];
  const owners = policy.affectedPathOwners ?? {};
  return Object.entries(owners)
    .filter(([prefix]) => path === prefix || path.startsWith(prefix))
    .flatMap(([, names]) => names)
    .filter((name) => packages.some((item) => item.name === name));
}

const FULL_STORYBOOK_EVENTS = new Set(['schedule', 'workflow_dispatch', 'check:all', 'release']);

function inheritedFullStorybookSelection() {
  const event = process.env.MUXUI_STORYBOOK_AUDIT_EVENT ?? process.env.GITHUB_EVENT_NAME;
  return process.env.MUXUI_STORYBOOK_AUDIT_FORCE === '1'
    || FULL_STORYBOOK_EVENTS.has(event);
}

export function changedPackageSelection({ changedPaths, packages, policy }) {
  const changed = [...new Set(changedPaths)].sort();
  const global = changed.filter((path) => matchesPath(path, policy.globalTaskInputs ?? []));
  const owners = [...new Set(changed.flatMap((path) => ownerPackagesForPath(path, packages, policy)))];
  const mapped = new Set(changed.filter((path) => global.includes(path) || ownerPackagesForPath(path, packages, policy).length > 0));
  const unmapped = changed.filter((path) => !mapped.has(path));
  if (unmapped.length > 0) {
    throw new Error(`MUXUI_AFFECTED_PATH_UNMAPPED: ${unmapped.join(', ')}; add an owner mapping or use an explicit scope`);
  }
  if (global.length > 0) {
    return {
      mode: 'full',
      directPackages: packages,
      reason: `global task inputs changed: ${global.join(', ')}`,
      changedPaths: changed,
      globalPaths: global,
      unmappedPaths: [],
    };
  }
  if (owners.length === 0) {
    throw new Error('MUXUI_AFFECTED_PATHS_EMPTY: no changed paths identify a workspace owner');
  }
  return {
    mode: 'affected',
    directPackages: packages.filter(({ name }) => owners.includes(name)),
    reason: `changed owners: ${owners.join(', ')}`,
    changedPaths: changed,
    globalPaths: [],
    unmappedPaths: [],
  };
}

export function familyRecordsFromContract(contract, bindings = []) {
  const exportsByBinding = new Map(bindings.map((record) => [record.binding, record.export]));
  return (contract.components ?? contract.bindings ?? []).map((record) => ({
    family: record.family ?? record.export,
    export: record.export ?? exportsByBinding.get(record.binding),
    name: record.name,
    slug: record.slug ?? String(record.family ?? record.export).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
    source: record.source,
  })).filter(({ family, slug }) => family && slug);
}

export async function loadReactFamilyRecords(repositoryRoot) {
  const paths = ['packages/react/generated/r1-6-contract.json', 'packages/react/generated/descriptor.json'];
  const contracts = await Promise.all(paths.map(async (path) => {
    const content = await readFile(`${repositoryRoot}/${path}`, 'utf8').catch(() => null);
    return content ? JSON.parse(content.split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n')) : null;
  }));
  for (const contract of contracts) {
    if (!contract) continue;
    // The family contract retains substrate names; the descriptor projects public exports.
    const records = familyRecordsFromContract(contract, contracts[1]?.bindings);
    if (records.length > 0) return records;
  }
  throw new Error('MUXUI_COMPONENT_METADATA_MISSING: generate @muxui/react before selecting a component');
}

export function planScopedTask({ options, packages, policy, familyRecords = [] , changedPaths = [] }) {
  const hasExplicitScope = options.components.length > 0 || options.packages.length > 0 || options.files.length > 0;
  if (options.full && hasExplicitScope) {
    throw new Error('MUXUI_TASK_SCOPE_CONFLICT: --full cannot be combined with component, package, or file selectors');
  }
  if (hasExplicitScope && inheritedFullStorybookSelection()) {
    throw new Error(
      'MUXUI_TASK_SCOPE_CONFLICT: scoped selectors cannot run while a forced-full Storybook event is active; use --full or clear MUXUI_STORYBOOK_AUDIT_FORCE/MUXUI_STORYBOOK_AUDIT_EVENT',
    );
  }
  const selectorKinds = [options.components, options.packages, options.files].filter((values) => values.length > 0);
  if (selectorKinds.length > 1) {
    throw new Error('MUXUI_TASK_SCOPE_CONFLICT: choose one selector kind: component, package, or files');
  }

  let scope = 'full';
  let reason = `${options.task} requested full workspace coverage`;
  let directPackages = packages;
  let familySelection = [];
  let storybookFamilySelection = [];
  let focusedComponent = false;

  if (options.full) {
    scope = 'full';
    reason = 'explicit full graph requested';
  } else if (options.components.length > 0) {
    const records = expandRelatedFamilies(familyRecords, resolveComponents(options.components, familyRecords));
    familySelection = records.map(({ family }) => family);
    storybookFamilySelection = records.map((record) => record.export ?? record.family);
    directPackages = packages.filter(({ name }) => ['@muxui/react', '@muxui/react-storybook'].includes(name));
    if (directPackages.length === 0) throw new Error('MUXUI_COMPONENT_PACKAGES_MISSING: React and Storybook packages are required');
    scope = 'component';
    focusedComponent = true;
    reason = `component scope: ${familySelection.join(', ')}`;
  } else if (options.packages.length > 0) {
    directPackages = options.packages.map((value) => resolvePackage(packages, value));
    scope = 'package';
    reason = `package scope: ${directPackages.map(({ name }) => name).join(', ')}`;
  } else if (options.files.length > 0) {
    const normalizedFiles = options.files.map((path) => path.replace(/\\/gu, '/').replace(/^\.\//u, ''));
    const unresolved = normalizedFiles.filter((path) => path.startsWith('../') || path.includes('/../') || path.startsWith('/'));
    if (unresolved.length > 0) throw new Error(`MUXUI_FILE_SCOPE_INVALID: ${unresolved.join(', ')}`);
    const owners = [...new Set(normalizedFiles.flatMap((path) => ownerPackagesForPath(path, packages, policy)))];
    const global = normalizedFiles.filter((path) => matchesPath(path, policy.globalTaskInputs ?? []));
    const unmapped = normalizedFiles.filter((path) => !global.includes(path) && ownerPackagesForPath(path, packages, policy).length === 0);
    if (unmapped.length > 0) throw new Error(`MUXUI_FILE_SCOPE_UNMAPPED: ${unmapped.join(', ')}`);
    if (global.length > 0) {
      scope = 'full';
      reason = `file scope includes global task inputs: ${global.join(', ')}`;
      directPackages = packages;
    } else {
      directPackages = packages.filter(({ name }) => owners.includes(name));
      scope = 'files';
      reason = `file scope: ${normalizedFiles.join(', ')}`;
    }
  } else if (options.affected && !hasExplicitScope) {
    const affected = changedPackageSelection({ changedPaths, packages, policy });
    scope = affected.mode;
    reason = affected.reason;
    directPackages = affected.directPackages;
  }

  const full = scope === 'full';
  const checkPackages = full
    ? packages
    : scope === 'affected'
      ? dependentClosure(packages, directPackages.map(({ name }) => name))
      : scope === 'component'
        ? directPackages
        : dependentClosure(packages, directPackages.map(({ name }) => name));
  const generationPackages = full
    ? packages
    : dependencyClosure(packages, checkPackages.map(({ name }) => name));

  return {
    scope,
    full,
    focusedComponent,
    reason,
    familySelection: [...new Set(familySelection)].sort(),
    storybookFamilySelection: [...new Set(storybookFamilySelection)].sort(),
    directPackages,
    checkPackages,
    generationPackages,
    changedPaths,
  };
}
