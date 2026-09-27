import { parse as parseJavaScript } from 'acorn';
import * as cssTree from 'css-tree';
import path from 'node:path';

function fail(code, message) {
  throw new Error(`MUXUI_CI_IMPACT_${code}: ${message}`);
}

function normalizedPath(value) {
  return path.posix.normalize(String(value ?? '').replaceAll('\\', '/')).replace(/^\.\//u, '');
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stableAst(value) {
  if (Array.isArray(value)) return value.map(stableAst);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue;
    result[key] = stableAst(value[key]);
  }
  return result;
}

function astSignature(value) {
  return JSON.stringify(stableAst(value));
}

function parseModule(source, sourcePath, side) {
  try {
    return parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    fail('SOURCE_PARSE', `cannot parse ${side} JavaScript for ${sourcePath}: ${error.message}`);
  }
}

function declaredNames(pattern, names = []) {
  if (!pattern) return names;
  if (pattern.type === 'Identifier') names.push(pattern.name);
  else if (pattern.type === 'RestElement') declaredNames(pattern.argument, names);
  else if (pattern.type === 'AssignmentPattern') declaredNames(pattern.left, names);
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((element) => declaredNames(element, names));
  else if (pattern.type === 'ObjectPattern') {
    pattern.properties.forEach((property) => declaredNames(property.type === 'RestElement' ? property.argument : property.value, names));
  }
  return names;
}

function collectIdentifiers(node, identifiers = new Set()) {
  if (!node || typeof node !== 'object') return identifiers;
  if (node.type === 'Identifier') identifiers.add(node.name);
  if (Array.isArray(node)) {
    node.forEach((child) => collectIdentifiers(child, identifiers));
    return identifiers;
  }
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue;
    if (key === 'type' || key === 'name') continue;
    if (value && typeof value === 'object') collectIdentifiers(value, identifiers);
  }
  return identifiers;
}

function exportName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.value);
  return null;
}

const REACT_FACTORIES = new Set(['forwardRef', 'memo', 'createContext']);

function reactFactoryBindings(program) {
  const namespaces = new Set();
  const named = new Set();
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'react') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportDefaultSpecifier' || specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name);
      } else if (specifier.type === 'ImportSpecifier' && REACT_FACTORIES.has(exportName(specifier.imported))) {
        named.add(specifier.local.name);
      }
    }
  }
  return { namespaces, named };
}

function isReactFactoryCall(callee, bindings) {
  if (callee?.type === 'Identifier') return bindings.named.has(callee.name);
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Identifier'
    || !bindings.namespaces.has(callee.object.name)) return false;
  const property = callee.computed ? callee.property.value : callee.property.name;
  return REACT_FACTORIES.has(property);
}

function isFunctionNode(node) {
  return ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node?.type);
}

function collectInitializerEffects(initializer, bindings) {
  const references = new Set();
  let hasCall = false;

  function visit(value, conservativeCallbacks = false) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, conservativeCallbacks));
      return;
    }
    if (isFunctionNode(value)) {
      if (conservativeCallbacks) visit(value.body, true);
      return;
    }
    if (value.type === 'Identifier') {
      references.add(value.name);
      return;
    }
    if (value.type === 'VariableDeclarator') {
      visit(value.init, conservativeCallbacks);
      return;
    }
    if (value.type === 'Property') {
      if (value.computed) visit(value.key, conservativeCallbacks);
      visit(value.value, conservativeCallbacks);
      return;
    }
    if (value.type === 'MemberExpression') {
      visit(value.object, conservativeCallbacks);
      if (value.computed) visit(value.property, conservativeCallbacks);
      return;
    }
    if (value.type === 'CallExpression') {
      hasCall = true;
      if (isFunctionNode(value.callee)) {
        visit(value.callee.body);
        value.arguments.forEach((argument) => visit(argument, true));
      } else {
        visit(value.callee);
        const conservative = !isReactFactoryCall(value.callee, bindings);
        value.arguments.forEach((argument) => visit(argument, conservative));
      }
      return;
    }
    if (value.type === 'NewExpression') {
      hasCall = true;
      visit(value.callee);
      value.arguments.forEach((argument) => visit(argument, true));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (['type', 'name', 'start', 'end', 'loc', 'range', 'id', 'params', 'label'].includes(key)) continue;
      if (child && typeof child === 'object') visit(child, conservativeCallbacks);
    }
  }

  visit(initializer);
  return { hasCall, references };
}

function moduleIndex(program, sourcePath, side) {
  const definitions = new Map();
  const exports = new Map();
  const importSignatures = [];
  const unownedStatements = [];
  const topLevelEffectReferences = new Set();
  const externalReexports = [];
  const reactBindings = reactFactoryBindings(program);

  function addUnownedStatement(statement) {
    unownedStatements.push(astSignature(statement));
    collectIdentifiers(statement, topLevelEffectReferences);
  }

  function addInitializerEffect(declarator) {
    const effect = collectInitializerEffects(declarator.init, reactBindings);
    if (effect.hasCall) effect.references.forEach((reference) => topLevelEffectReferences.add(reference));
  }

  function addDefinition(name, node, kind = 'declaration') {
    const existing = definitions.get(name);
    if (existing) fail('SOURCE_OWNERSHIP', `${side} JavaScript in ${sourcePath} has ambiguous top-level binding ${name}`);
    definitions.set(name, {
      name,
      node,
      kind,
      signature: astSignature(node),
      references: null,
    });
  }

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      importSignatures.push(astSignature(statement));
      for (const specifier of statement.specifiers) addDefinition(specifier.local.name, specifier, 'import');
      continue;
    }

    if (statement.type === 'ExportAllDeclaration') {
      externalReexports.push(astSignature(statement));
      continue;
    }

    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.source) externalReexports.push(astSignature(statement));
      if (statement.declaration) {
        const declaration = statement.declaration;
        if (declaration.type === 'VariableDeclaration') {
          for (const declarator of declaration.declarations) {
            for (const name of declaredNames(declarator.id)) addDefinition(name, declarator);
            addInitializerEffect(declarator);
          }
        } else if (declaration.id?.name) {
          addDefinition(declaration.id.name, declaration);
        }
        const names = declaration.type === 'VariableDeclaration'
          ? declaration.declarations.flatMap((declarator) => declaredNames(declarator.id))
          : declaration.id?.name ? [declaration.id.name] : [];
        for (const name of names) exports.set(name, name);
      }
      for (const specifier of statement.specifiers) {
        const exported = exportName(specifier.exported);
        const local = exportName(specifier.local);
        if (exported && local) exports.set(exported, local);
      }
      if (!statement.declaration && !statement.specifiers.length) addUnownedStatement(statement);
      continue;
    }

    if (statement.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration;
      const name = declaration.id?.name;
      if (name) {
        addDefinition(name, declaration);
        exports.set('default', name);
      } else {
        exports.set('default', '<default>');
        addUnownedStatement(statement);
      }
      continue;
    }

    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        for (const name of declaredNames(declarator.id)) addDefinition(name, declarator);
        addInitializerEffect(declarator);
      }
      continue;
    }

    if ((statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') && statement.id?.name) {
      addDefinition(statement.id.name, statement);
      continue;
    }

    addUnownedStatement(statement);
  }

  for (const definition of definitions.values()) {
    definition.references = [...collectIdentifiers(definition.node)].filter((name) => name !== definition.name);
  }
  return { definitions, exports, importSignatures, externalReexports, unownedStatements, topLevelEffectReferences };
}

function recordExport(record) {
  return String(record.export ?? record.family ?? '');
}

function recordFamily(record) {
  return String(record.family ?? record.export ?? '');
}

function sourceRecords(records, sourcePath) {
  if (!Array.isArray(records)) fail('SOURCE_OWNERSHIP', 'canonical family records must be an array');
  const owners = records.filter((record) => normalizedPath(record.source) === sourcePath);
  if (owners.length === 0) return [];
  for (const record of owners) {
    if (!recordFamily(record) || !recordExport(record)) {
      fail('SOURCE_OWNERSHIP', `canonical ownership record for ${sourcePath} is missing its family or export`);
    }
  }
  return owners;
}

function recordBindings(index, records, sourcePath) {
  const bindings = new Map();
  for (const record of records) {
    const family = recordFamily(record);
    const exported = recordExport(record);
    const local = index.exports.get(exported);
    if (!local || local === '<default>' || !index.definitions.has(local)) continue;
    if (!bindings.has(local)) bindings.set(local, new Set());
    bindings.get(local).add(family);
  }
  return bindings;
}

function dependentBindings(index) {
  const reverse = new Map();
  for (const [name, definition] of index.definitions) {
    if (definition.kind === 'import') continue;
    for (const reference of definition.references) {
      if (!index.definitions.has(reference) || reference === name) continue;
      if (!reverse.has(reference)) reverse.set(reference, new Set());
      reverse.get(reference).add(name);
    }
  }
  return reverse;
}

function reachableFamilies(binding, index, bindings) {
  const reverse = dependentBindings(index);
  const reached = new Set();
  const visited = new Set([binding]);
  const queue = [binding];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const family of bindings.get(current) ?? []) reached.add(family);
    for (const dependent of reverse.get(current) ?? []) {
      if (visited.has(dependent)) continue;
      visited.add(dependent);
      queue.push(dependent);
    }
  }
  return reached;
}

function moduleFamilyNames(records) {
  return sortedUnique(records.map(recordFamily).filter(Boolean));
}

function compareModuleChange({ before, after, records, sourcePath }) {
  const families = moduleFamilyNames(records);
  if (before.length === 0 || after.length === 0) {
    return { families, shared: true, reason: `module ${sourcePath} was added or removed; all source families are affected` };
  }

  const beforeProgram = parseModule(before, sourcePath, 'base');
  const afterProgram = parseModule(after, sourcePath, 'head');
  if (astSignature(beforeProgram) === astSignature(afterProgram)) {
    return { families: [], shared: false, reason: `JavaScript AST for ${sourcePath} is semantically unchanged` };
  }
  const beforeIndex = moduleIndex(beforeProgram, sourcePath, 'base');
  const afterIndex = moduleIndex(afterProgram, sourcePath, 'head');
  const beforeBindings = recordBindings(beforeIndex, records, sourcePath);
  const afterBindings = recordBindings(afterIndex, records, sourcePath);
  for (const record of records) {
    const family = recordFamily(record);
    if (![...beforeBindings.values(), ...afterBindings.values()].some((owners) => owners.has(family))) {
      fail('SOURCE_OWNERSHIP', `canonical export ${recordExport(record)} for ${family} is not declared by ${sourcePath} on either side`);
    }
  }

  if (JSON.stringify(beforeIndex.importSignatures) !== JSON.stringify(afterIndex.importSignatures)
    || JSON.stringify(beforeIndex.externalReexports) !== JSON.stringify(afterIndex.externalReexports)) {
    return { families, shared: true, reason: `imports or re-exports changed in shared source module ${sourcePath}` };
  }

  if (JSON.stringify(beforeIndex.unownedStatements) !== JSON.stringify(afterIndex.unownedStatements)) {
    return { families, shared: true, reason: `top-level side effects or unowned statements changed in ${sourcePath}` };
  }

  const exportNames = new Set([...beforeIndex.exports.keys(), ...afterIndex.exports.keys()]);
  const changedExportFamilies = new Set();
  for (const name of exportNames) {
    const beforeLocal = beforeIndex.exports.get(name);
    const afterLocal = afterIndex.exports.get(name);
    if (beforeLocal === afterLocal) continue;
    const owners = records.filter((record) => recordExport(record) === name);
    if (owners.length === 0) return { families, shared: true, reason: `unowned export ${name} changed in ${sourcePath}` };
    owners.forEach((record) => changedExportFamilies.add(recordFamily(record)));
  }

  const changedBindings = new Set();
  for (const name of new Set([...beforeIndex.definitions.keys(), ...afterIndex.definitions.keys()])) {
    if (beforeIndex.definitions.get(name)?.signature !== afterIndex.definitions.get(name)?.signature) changedBindings.add(name);
  }

  const changedSideEffectDependency = [...changedBindings].some((name) => (
    [beforeIndex, afterIndex].some((index) => [...index.topLevelEffectReferences].some((reference) => (
      dependencyClosure(reference, index).has(name)
    )))
  ));
  if (changedSideEffectDependency) {
    return {
      families,
      shared: true,
      reason: `changed declarations are used by an unowned top-level side effect in ${sourcePath}`,
    };
  }

  const affected = new Set(changedExportFamilies);
  const helperNames = [];
  for (const name of changedBindings) {
    if (beforeIndex.definitions.get(name)?.kind === 'import' || afterIndex.definitions.get(name)?.kind === 'import') {
      return { families, shared: true, reason: `import binding ${name} changed in ${sourcePath}` };
    }
    const directOwners = new Set([...(beforeBindings.get(name) ?? []), ...(afterBindings.get(name) ?? [])]);
    if (directOwners.size > 0) {
      directOwners.forEach((family) => affected.add(family));
      for (const [index, bindings] of [[beforeIndex, beforeBindings], [afterIndex, afterBindings]]) {
        reachableFamilies(name, index, bindings).forEach((family) => affected.add(family));
      }
      continue;
    }

    helperNames.push(name);
    for (const [index, bindings] of [[beforeIndex, beforeBindings], [afterIndex, afterBindings]]) {
      reachableFamilies(name, index, bindings).forEach((family) => affected.add(family));
    }
  }

  if (affected.size === 0) {
    return { families, shared: true, reason: `changed AST in ${sourcePath} could not be assigned to a canonical family` };
  }
  if (helperNames.length > 0) {
    const selected = sortedUnique(affected);
    const shared = selected.length > 1;
    return {
      families: selected,
      shared,
      reason: shared
        ? `changed helper declarations ${sortedUnique(helperNames).join(', ')} are reachable from ${selected.join(', ')}`
        : `changed helper declarations ${sortedUnique(helperNames).join(', ')} are reachable from ${selected[0]}`,
    };
  }
  return {
    families: sortedUnique(affected),
    shared: affected.size > 1,
    reason: `changed owned exports in ${sourcePath}: ${sortedUnique(affected).join(', ')}`,
  };
}

function sourceMapForSide(moduleSources, side, changedPath, changedSource) {
  const result = new Map();
  const entries = moduleSources instanceof Map ? [...moduleSources] : Object.entries(moduleSources ?? {});
  for (const [sourcePath, value] of entries) {
    const alternateSide = side === 'before' ? 'after' : 'before';
    const content = typeof value === 'string'
      ? value
      : value && Object.hasOwn(value, side)
        ? value[side]
        : value?.[alternateSide];
    if (typeof content === 'string') result.set(normalizedPath(sourcePath), content);
  }
  result.set(changedPath, changedSource);
  return result;
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walkAst(child, visit));
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue;
    if (value && typeof value === 'object') walkAst(value, visit);
  }
}

function resolveLocalModule(importerPath, specifier, sourcePaths) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return null;
  const base = normalizedPath(path.posix.join(path.posix.dirname(importerPath), specifier));
  const candidates = [base];
  if (!path.posix.extname(base)) candidates.push(`${base}.mjs`, `${base}/index.mjs`);
  return candidates.find((candidate) => sourcePaths.has(candidate)) ?? null;
}

function moduleEdges(program, importerPath, sourcePaths) {
  const edges = [];
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      const target = resolveLocalModule(importerPath, statement.source.value, sourcePaths);
      if (target) {
        edges.push({
          target,
          kind: 'import',
          bindings: statement.specifiers.map((specifier) => ({
            local: specifier.local.name,
            imported: specifier.type === 'ImportDefaultSpecifier'
              ? 'default'
              : specifier.type === 'ImportNamespaceSpecifier'
                ? '*'
                : exportName(specifier.imported),
          })),
        });
      }
    } else if (statement.type === 'ExportNamedDeclaration' && statement.source) {
      const target = resolveLocalModule(importerPath, statement.source.value, sourcePaths);
      if (target) edges.push({
        target,
        kind: 'reexport',
        bindings: statement.specifiers.map((specifier) => ({
          imported: exportName(specifier.local),
          exported: exportName(specifier.exported),
        })),
      });
    } else if (statement.type === 'ExportAllDeclaration') {
      const target = resolveLocalModule(importerPath, statement.source.value, sourcePaths);
      if (target) edges.push({ target, kind: 'export-all' });
    }
  }
  walkAst(program, (node) => {
    if (node.type !== 'ImportExpression' || node.source?.type !== 'Literal') return;
    const target = resolveLocalModule(importerPath, node.source.value, sourcePaths);
    if (target) edges.push({ target, kind: 'dynamic' });
  });
  return edges;
}

function dependencyClosure(binding, index) {
  const reached = new Set();
  const queue = [binding];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reached.has(current)) continue;
    reached.add(current);
    for (const reference of index.definitions.get(current)?.references ?? []) {
      if (index.definitions.has(reference) && !reached.has(reference)) queue.push(reference);
    }
  }
  return reached;
}

function familiesUsingBinding(records, sourcePath, index, binding) {
  const affected = [];
  for (const record of sourceRecords(records, sourcePath)) {
    const exportedBinding = index.exports.get(recordExport(record));
    if (exportedBinding && dependencyClosure(exportedBinding, index).has(binding)) {
      affected.push(recordFamily(record));
    }
  }
  return affected;
}

function exportsDependingOnBinding(index, binding) {
  return [...index.exports]
    .filter(([, local]) => local !== '<default>' && dependencyClosure(local, index).has(binding))
    .map(([name]) => name);
}

function topLevelEffectUsesBinding(index, binding) {
  return [...index.topLevelEffectReferences].some((reference) => dependencyClosure(reference, index).has(binding));
}

function sourceModulesForSide({ moduleSources, side, sourcePath, changedSource, records }) {
  if (!moduleSources) fail('SOURCE_OWNERSHIP', `moduleSources snapshots are required to verify React consumers of ${sourcePath}`);
  const rawEntries = moduleSources instanceof Map ? [...moduleSources] : Object.entries(moduleSources);
  const knownPaths = new Set(rawEntries.map(([modulePath]) => normalizedPath(modulePath)));
  const missing = sortedUnique(records.map((record) => normalizedPath(record.source)).filter((recordPath) => !knownPaths.has(recordPath)));
  if (missing.length > 0) fail('SOURCE_OWNERSHIP', `moduleSources is missing canonical family source snapshots: ${missing.join(', ')}`);
  const sources = sourceMapForSide(moduleSources, side, sourcePath, changedSource);
  const knownSourcePaths = new Set(sources.keys());
  const modules = new Map();
  for (const [modulePath, source] of sources) {
    const program = parseModule(source, modulePath, side);
    modules.set(modulePath, {
      program,
      index: null,
      edges: moduleEdges(program, modulePath, knownSourcePaths),
    });
  }
  return modules;
}

function sourceModuleIndex(module, modulePath, side) {
  module.index ??= moduleIndex(module.program, modulePath, side);
  return module.index;
}

function importedFamilyConsumers({ records, sourcePath, exportNames, before, after, moduleSources }) {
  const consumers = new Set();
  for (const [side, changedSource] of [['before', before], ['after', after]]) {
    const modules = sourceModulesForSide({ moduleSources, side, sourcePath, changedSource, records });
    const queue = exportNames.map((name) => ({ modulePath: sourcePath, name }));
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      const key = `${current.modulePath}\0${current.name}`;
      if (visited.has(key)) continue;
      visited.add(key);
      for (const [importerPath, importer] of modules) {
        const matchingEdges = importer.edges.filter((edge) => edge.target === current.modulePath);
        if (matchingEdges.length === 0) continue;
        const families = sourceRecords(records, importerPath);
        if (families.length === 0) {
          const index = sourceModuleIndex(importer, importerPath, side);
          for (const edge of matchingEdges) {
            if (edge.kind === 'import') {
              for (const binding of edge.bindings) {
                if (current.name !== '*' && binding.imported !== '*' && binding.imported !== current.name) continue;
                const exports = topLevelEffectUsesBinding(index, binding.local)
                  ? [...index.exports.keys()]
                  : exportsDependingOnBinding(index, binding.local);
                for (const name of exports) {
                  queue.push({ modulePath: importerPath, name });
                }
              }
            } else if (edge.kind === 'reexport') {
              for (const binding of edge.bindings) {
                if (current.name === '*' || binding.imported === current.name) {
                  queue.push({ modulePath: importerPath, name: binding.exported });
                }
              }
            } else if (edge.kind === 'export-all' && current.name !== 'default') {
              queue.push({ modulePath: importerPath, name: current.name });
            }
          }
          continue;
        }

        const index = sourceModuleIndex(importer, importerPath, side);
        for (const edge of matchingEdges) {
          if (edge.kind === 'import') {
            if (current.name === '*') {
              families.forEach((record) => consumers.add(recordFamily(record)));
            }
            for (const binding of edge.bindings) {
              if (current.name === '*' || binding.imported === '*' || binding.imported === current.name) {
                if (topLevelEffectUsesBinding(index, binding.local)) {
                  families.forEach((record) => consumers.add(recordFamily(record)));
                }
                familiesUsingBinding(families, importerPath, index, binding.local).forEach((family) => consumers.add(family));
                const exports = topLevelEffectUsesBinding(index, binding.local)
                  ? [...index.exports.keys()]
                  : exportsDependingOnBinding(index, binding.local);
                for (const name of exports) {
                  queue.push({ modulePath: importerPath, name });
                }
              }
            }
          } else if (edge.kind === 'reexport') {
            for (const binding of edge.bindings) {
              if (current.name !== '*' && binding.imported !== current.name) continue;
              for (const record of families) {
                if (recordExport(record) === binding.exported) consumers.add(recordFamily(record));
              }
              queue.push({ modulePath: importerPath, name: binding.exported });
            }
          } else if (edge.kind === 'export-all' && current.name !== 'default') {
            queue.push({ modulePath: importerPath, name: current.name });
          } else if (edge.kind === 'dynamic') {
            families.forEach((record) => consumers.add(recordFamily(record)));
          }
        }
      }
    }
  }
  return sortedUnique(consumers);
}

function exportsAffectedByChange({ sourcePath, before, after }) {
  if (before.length === 0 || after.length === 0) return ['*'];
  const beforeProgram = parseModule(before, sourcePath, 'base');
  const afterProgram = parseModule(after, sourcePath, 'head');
  if (astSignature(beforeProgram) === astSignature(afterProgram)) return [];
  const beforeIndex = moduleIndex(beforeProgram, sourcePath, 'base');
  const afterIndex = moduleIndex(afterProgram, sourcePath, 'head');
  if (JSON.stringify(beforeIndex.importSignatures) !== JSON.stringify(afterIndex.importSignatures)
    || JSON.stringify(beforeIndex.externalReexports) !== JSON.stringify(afterIndex.externalReexports)
    || JSON.stringify(beforeIndex.unownedStatements) !== JSON.stringify(afterIndex.unownedStatements)) return ['*'];

  const affected = new Set();
  const exportNames = new Set([...beforeIndex.exports.keys(), ...afterIndex.exports.keys()]);
  for (const name of exportNames) {
    const beforeLocal = beforeIndex.exports.get(name);
    const afterLocal = afterIndex.exports.get(name);
    if (beforeLocal !== afterLocal
      || beforeIndex.definitions.get(beforeLocal)?.signature !== afterIndex.definitions.get(afterLocal)?.signature) {
      affected.add(name);
    }
  }
  for (const name of new Set([...beforeIndex.definitions.keys(), ...afterIndex.definitions.keys()])) {
    if (beforeIndex.definitions.get(name)?.signature === afterIndex.definitions.get(name)?.signature) continue;
    for (const index of [beforeIndex, afterIndex]) {
      for (const [exported, binding] of index.exports) {
        if (dependencyClosure(binding, index).has(name)) affected.add(exported);
      }
    }
  }
  return affected.size > 0 ? sortedUnique(affected) : ['*'];
}

/** Analyze a React module change using canonical generated family ownership records. */
export function analyzeReactSourceChange({ records, before = '', after = '', sourcePath, moduleSources }) {
  const allRecords = Array.isArray(records) ? records : [];
  const inferredPaths = sortedUnique(allRecords.map((record) => normalizedPath(record.source)).filter(Boolean));
  const pathCandidate = sourcePath ?? (inferredPaths.length === 1 ? inferredPaths[0] : '');
  if (!pathCandidate) fail('SOURCE_OWNERSHIP', 'sourcePath is required when canonical records span multiple source modules');
  const changedPath = normalizedPath(pathCandidate);
  const directOwners = sourceRecords(allRecords, changedPath);
  if (directOwners.length > 0) {
    const local = compareModuleChange({ before, after, records: directOwners, sourcePath: changedPath });
    if (local.families.length === 0) return local;
    const changedExports = sortedUnique(directOwners
      .filter((record) => local.families.includes(recordFamily(record)))
      .map(recordExport));
    const consumers = importedFamilyConsumers({
      records: allRecords,
      sourcePath: changedPath,
      exportNames: changedExports,
      before,
      after,
      moduleSources,
    });
    const families = sortedUnique([...local.families, ...consumers]);
    const addedConsumers = consumers.filter((family) => !local.families.includes(family));
    return {
      ...local,
      families,
      shared: local.shared || families.length > 1,
      reason: addedConsumers.length > 0
        ? `${local.reason}; imported consumers: ${addedConsumers.join(', ')}`
        : local.reason,
    };
  }
  if (astSignature(parseModule(before, changedPath, 'base')) === astSignature(parseModule(after, changedPath, 'head'))) {
    return { families: [], shared: false, reason: `JavaScript AST for ${changedPath} is semantically unchanged` };
  }

  const changedExports = exportsAffectedByChange({ sourcePath: changedPath, before, after });
  const consumers = importedFamilyConsumers({
    records: allRecords,
    sourcePath: changedPath,
    exportNames: changedExports,
    before,
    after,
    moduleSources,
  });
  if (consumers.length === 0) {
    fail('SOURCE_OWNERSHIP', `changed module ${changedPath} has no canonical family source or resolvable React importer`);
  }
  return {
    families: consumers,
    shared: consumers.length > 1,
    reason: `changed helper module exports in ${changedPath} are imported by React families ${consumers.join(', ')}`,
  };
}

function cssSelectors(rule) {
  if (rule.prelude?.type !== 'SelectorList') return [];
  return rule.prelude.children.toArray().filter((node) => node.type === 'Selector');
}

function orderedBlockSignature(block) {
  return (block?.children.toArray() ?? []).flatMap((child) => {
    if (child.type === 'Comment') return [];
    if (child.type === 'Rule') return [`rule:${cssTree.generate(child.prelude)}`];
    if (child.type === 'Atrule') {
      const prelude = child.prelude ? cssTree.generate(child.prelude) : '';
      return [`at-rule:${child.name}:${prelude}`];
    }
    return [`${child.type}:${cssTree.generate(child)}`];
  }).join('\0');
}

function partNames(record) {
  const parts = record.parts ?? record.api?.parts ?? [];
  return Array.isArray(parts) ? parts.filter((part) => typeof part === 'string') : [];
}

function ownersForClass(className, records) {
  const matches = [];
  for (const record of records) {
    const slug = String(record.slug ?? '').trim();
    if (!slug) continue;
    const root = `muxui-${slug}`;
    const isRootOrPart = className === root
      || className.startsWith(`${root}__`)
      || className.startsWith(`${root}-`);
    const isDeclaredPart = partNames(record).some((part) => (
      className === `${root}__${part}` || className === `${root}-${part}`
    ));
    if (isRootOrPart || isDeclaredPart) matches.push({ family: recordFamily(record), slugLength: slug.length });
  }

  if (matches.length === 0) {
    const genericPart = records.filter((record) => partNames(record).includes(className.replace(/^muxui-/u, '')));
    return new Set(genericPart.map(recordFamily));
  }
  const longest = Math.max(...matches.map(({ slugLength }) => slugLength));
  return new Set(matches.filter(({ slugLength }) => slugLength === longest).map(({ family }) => family));
}

const statePseudoClasses = new Set([
  'active', 'checked', 'disabled', 'enabled', 'focus', 'focus-visible', 'hover', 'indeterminate',
  'invalid', 'open', 'optional', 'placeholder-shown', 'read-only', 'read-write', 'required', 'valid',
]);
const stateAttributes = new Set([
  'disabled', 'checked', 'required', 'readonly', 'selected', 'open',
  'aria-checked', 'aria-current', 'aria-disabled', 'aria-expanded', 'aria-haspopup', 'aria-invalid',
  'aria-pressed', 'aria-readonly', 'aria-required', 'aria-selected',
]);

function isStateOnlySelector(selector) {
  const nodes = selector.children?.toArray() ?? [];
  return nodes.length > 0 && nodes.every((node) => {
    if (node.type === 'PseudoClassSelector') {
      return statePseudoClasses.has(node.name.toLowerCase()) && !node.children;
    }
    if (node.type === 'AttributeSelector') {
      const name = node.name?.name?.toLowerCase();
      return typeof name === 'string' && (name.startsWith('data-') || stateAttributes.has(name));
    }
    return false;
  });
}

function selectorOwners(selector, records, inherited = []) {
  const owners = new Set();
  let hasUnanchoredRelation = false;
  for (const inheritedSelector of inherited) {
    selectorOwners(inheritedSelector, records).forEach((family) => owners.add(family));
  }

  const nodes = selector.children?.toArray() ?? [];
  for (const node of nodes) {
    if (node.type === 'ClassSelector') {
      ownersForClass(node.name, records).forEach((family) => owners.add(family));
    }
  }

  // State-only branches of :is()/:where() refine the selector they occur in.
  // They may use the selector's established component anchor, but cannot borrow
  // ownership from a sibling alternative inside the same functional pseudo.
  const stateFallbackOwners = new Set(owners);
  for (const node of nodes) {
    if (node.type !== 'PseudoClassSelector') continue;

    const pseudoName = node.name.toLowerCase();
    if (pseudoName === 'has') {
      hasUnanchoredRelation = true;
      continue;
    }
    if (pseudoName !== 'is' && pseudoName !== 'where') continue;

    const alternatives = node.children?.toArray()
      .find((child) => child.type === 'SelectorList')?.children.toArray()
      .filter((child) => child.type === 'Selector') ?? [];
    if (alternatives.length === 0) {
      fail('STYLE_OWNERSHIP', `selector pseudo :${pseudoName}() in "${cssTree.generate(selector)}" has no auditable alternatives`);
    }
    for (const alternative of alternatives) {
      const alternativeOwners = selectorOwners(alternative, records);
      if (alternativeOwners.size === 0) {
        if (isStateOnlySelector(alternative) && stateFallbackOwners.size > 0) {
          stateFallbackOwners.forEach((family) => owners.add(family));
          continue;
        }
        fail('STYLE_OWNERSHIP', `selector pseudo :${pseudoName}() alternative "${cssTree.generate(alternative)}" has no canonical component owner`);
      }
      alternativeOwners.forEach((family) => owners.add(family));
    }
  }
  if (hasUnanchoredRelation && owners.size === 0) {
    fail('STYLE_OWNERSHIP', `relational selector :has() in "${cssTree.generate(selector)}" needs an explicit canonical owner`);
  }
  return owners;
}

function isGlobalSelector(selector) {
  let global = false;
  cssTree.walk(selector, (node) => {
    if (node.type === 'PseudoClassSelector' && ['root', 'host', 'host-context'].includes(node.name)) global = true;
    if (node.type === 'TypeSelector' && ['html', 'body'].includes(node.name)) global = true;
    if (node.type === 'UniversalSelector') global = true;
  });
  return global;
}

function cssRuleEntries(source, sourcePath, side) {
  let ast;
  try {
    ast = cssTree.parse(source, { positions: false, parseCustomProperty: true });
  } catch (error) {
    fail('STYLE_PARSE', `cannot parse ${side} CSS for ${sourcePath}: ${error.message}`);
  }
  const entries = new Map();
  const occurrences = new Map();

  function addEntry(key, entry) {
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    entries.set(`${key}#${occurrence}`, entry);
  }

  function visit(children, atRules = [], inheritedSelectors = []) {
    for (const node of children.toArray()) {
      if (node.type === 'Atrule') {
        const atRule = `@${node.name}${node.prelude ? ` ${cssTree.generate(node.prelude)}` : ''}`;
        if (node.block) {
          const scopedSelectors = node.name === 'scope' && node.prelude
            ? [node.prelude]
            : inheritedSelectors;
          const nestedRules = node.block.children.toArray().some((child) => child.type === 'Rule' || child.type === 'Atrule');
          if (!nestedRules) {
            const key = `${[...atRules, atRule].join(' / ')}|<global>`;
            addEntry(key, {
              signature: cssTree.generate(node),
              selectors: inheritedSelectors,
              inheritedSelectors: [],
              global: inheritedSelectors.length === 0,
            });
          } else {
            visit(node.block.children, [...atRules, atRule], scopedSelectors);
            const directNodes = node.block.children.toArray().filter((child) => child.type !== 'Rule' && child.type !== 'Atrule');
            if (directNodes.length > 0) {
              const key = `${[...atRules, atRule].join(' / ')}|<declarations>`;
              addEntry(key, {
                signature: orderedBlockSignature(node.block),
                selectors: scopedSelectors,
                inheritedSelectors: [],
                global: scopedSelectors.length === 0,
              });
            }
          }
        } else {
          const key = `${[...atRules, atRule].join(' / ')}|<global>`;
          addEntry(key, { signature: cssTree.generate(node), selectors: [], inheritedSelectors: [], global: true });
        }
        continue;
      }

      if (node.type !== 'Rule') continue;
      const selectors = cssSelectors(node);
      if (selectors.length === 0) {
        const key = `${atRules.join(' / ')}|${cssTree.generate(node.prelude)}`;
        addEntry(key, { signature: cssTree.generate(node), selectors: [], inheritedSelectors, global: true });
        continue;
      }
      const selectorText = selectors.map((selector) => cssTree.generate(selector)).join(',');
      const key = `${atRules.join(' / ')}|${inheritedSelectors.map((selector) => cssTree.generate(selector)).join(' & ')}|${selectorText}`;
      addEntry(key, {
        signature: orderedBlockSignature(node.block),
        selectors,
        inheritedSelectors,
        global: false,
      });
      if (node.block) visit(node.block.children, atRules, [...inheritedSelectors, ...selectors]);
    }
  }

  visit(ast.children);
  return entries;
}

function changedCssEntryKeys(beforeEntries, afterEntries) {
  const changed = new Set([...beforeEntries.keys(), ...afterEntries.keys()].filter((key) => (
    beforeEntries.get(key)?.signature !== afterEntries.get(key)?.signature
  )));
  const afterPositions = new Map([...afterEntries.keys()].map((key, index) => [key, index]));
  const common = [...beforeEntries.keys()]
    .filter((key) => afterPositions.has(key))
    .map((key) => ({ key, afterPosition: afterPositions.get(key) }));
  const prefixMax = Array(common.length + 1).fill(Number.NEGATIVE_INFINITY);
  const suffixMin = Array(common.length + 1).fill(Number.POSITIVE_INFINITY);

  for (let index = 0; index < common.length; index += 1) {
    prefixMax[index + 1] = Math.max(prefixMax[index], common[index].afterPosition);
  }
  for (let index = common.length - 1; index >= 0; index -= 1) {
    suffixMin[index] = Math.min(suffixMin[index + 1], common[index].afterPosition);
  }

  // Only common rules participate, so insertions do not shift every later
  // rule into the changed set. Mark each rule crossed by another rule.
  for (let index = 0; index < common.length; index += 1) {
    const { key, afterPosition } = common[index];
    if (prefixMax[index] > afterPosition || suffixMin[index + 1] < afterPosition) {
      changed.add(key);
    }
  }
  return [...changed];
}

function moduleSnapshot(moduleSources, sourcePath, side) {
  const value = moduleSources instanceof Map ? moduleSources.get(sourcePath) : moduleSources?.[sourcePath];
  if (value === undefined) fail('SOURCE_OWNERSHIP', `moduleSources is missing the CSS owner source ${sourcePath}`);
  if (typeof value === 'string') return value;
  if (value && Object.hasOwn(value, side)) return typeof value[side] === 'string' ? value[side] : '';
  const alternateSide = side === 'before' ? 'after' : 'before';
  return typeof value?.[alternateSide] === 'string' ? value[alternateSide] : '';
}

/** Analyze changed CSS rules and resolve every selector branch to canonical families. */
export function analyzeReactStyleChange({ records, before = '', after = '', sourcePath = '<unknown CSS>', moduleSources }) {
  if (!Array.isArray(records) || records.length === 0) {
    fail('STYLE_OWNERSHIP', `canonical family records are required to analyze ${sourcePath}`);
  }
  const source = normalizedPath(sourcePath);
  const beforeEntries = cssRuleEntries(before, source, 'base');
  const afterEntries = cssRuleEntries(after, source, 'head');
  const changedKeys = changedCssEntryKeys(beforeEntries, afterEntries);
  if (changedKeys.length === 0) {
    return { families: [], theme: false, reason: `CSS rules in ${sourcePath} are semantically unchanged` };
  }

  const affected = new Set();
  const selectorsChanged = [];
  for (const key of changedKeys) {
    const entry = afterEntries.get(key) ?? beforeEntries.get(key);
    if (entry.global) {
      fail('STYLE_OWNERSHIP', `changed global or selector-free rule ${key} in ${sourcePath} requires its shared theme/style owner`);
    }
    const branches = entry.selectors;
    for (const selector of branches) {
      const owners = selectorOwners(selector, records, entry.inheritedSelectors);
      if (owners.size === 0) {
        const selectorText = cssTree.generate(selector);
        if (isGlobalSelector(selector)) {
          fail('STYLE_OWNERSHIP', `changed global selector "${selectorText}" in ${sourcePath} requires its shared theme/style owner`);
        }
        fail('STYLE_OWNERSHIP', `changed selector "${selectorText}" in ${sourcePath} has no canonical family owner`);
      }
      owners.forEach((family) => affected.add(family));
      selectorsChanged.push(cssTree.generate(selector));
    }
  }
  if (affected.size === 0) fail('STYLE_OWNERSHIP', `changed CSS in ${sourcePath} resolved to no canonical family owners`);
  const families = new Set(affected);
  if (moduleSources) {
    const rootsBySource = new Map();
    for (const record of records) {
      if (!affected.has(recordFamily(record))) continue;
      const recordSource = normalizedPath(record.source);
      if (!recordSource) fail('STYLE_OWNERSHIP', `canonical CSS owner ${recordFamily(record)} has no source module`);
      if (!rootsBySource.has(recordSource)) rootsBySource.set(recordSource, new Set());
      rootsBySource.get(recordSource).add(recordExport(record));
    }
    for (const [recordSource, exportNames] of rootsBySource) {
      const consumers = importedFamilyConsumers({
        records,
        sourcePath: recordSource,
        exportNames: sortedUnique(exportNames),
        before: moduleSnapshot(moduleSources, recordSource, 'before'),
        after: moduleSnapshot(moduleSources, recordSource, 'after'),
        moduleSources,
      });
      consumers.forEach((family) => families.add(family));
    }
  }
  const selectedFamilies = sortedUnique(families);
  const composed = selectedFamilies.filter((family) => !affected.has(family));
  return {
    families: selectedFamilies,
    theme: false,
    reason: `changed selectors in ${sourcePath} map to ${selectedFamilies.join(', ')} (${sortedUnique(selectorsChanged).join(', ')}; rules: ${changedKeys.join(', ')})${composed.length > 0 ? `; runtime consumers: ${composed.join(', ')}` : ''}`,
  };
}
