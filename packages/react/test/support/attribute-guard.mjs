// Source guards behind the state attribute rename (Decision 0031 item 19), called from styling-tokens.test.mjs. They
// read the TypeScript syntax tree (typescript-6, which has the JS API), not text, and take source text so a control can
// feed a mutant to the same function the real check uses.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript-6';

/**
 * The React Aria versions whose DOM readers were audited for the rename (the audit is in PR 2 of the Stage 2 plan:
 * the one closed-list state a dependency reads from the DOM is `data-placeholder`, on date segments). Bumping any of
 * them fails the guard until someone repeats the audit and updates this table; `react-stately` is not a direct
 * dependency, so it is resolved through React Aria Components.
 */
export const auditedReactAria = Object.freeze({
  'react-aria-components': '1.20.0',
  'react-aria': '3.51.0',
  'react-stately': '3.49.0',
});

/** What is wrong with the declared and installed React Aria versions, given the package manifest path. */
export function reactAriaVersionProblems(manifestPath, audited = auditedReactAria) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resolveFrom = (from, name) => JSON.parse(readFileSync(createRequire(from).resolve(`${name}/package.json`), 'utf8')).version;
  const racManifest = createRequire(manifestPath).resolve('react-aria-components/package.json');
  const problems = [];
  for (const [name, version] of Object.entries(audited)) {
    const declared = manifest.dependencies[name];
    if (declared !== undefined && declared !== version) problems.push(`${name} is declared as ${declared}, audited at ${version}`);
    const installed = resolveFrom(name === 'react-stately' ? racManifest : manifestPath, name);
    if (installed !== version) problems.push(`${name} is installed at ${installed}, audited at ${version}`);
  }
  return problems;
}

const parse = (text) => ts.createSourceFile('substrate.ts', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const builders = new Set(['withMuxState', 'withMuxListBoxState']);
/** `withMuxInputState(x)` adds an InputContext provider around `x`; the component it wraps is whatever `x` wraps. */
const unwrapInputState = (node) => (node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'withMuxInputState' ? unwrapInputState(node.arguments[0]) : node);

/**
 * What is wrong with src/substrate.ts, and the React Aria exports it wraps. Every export must be an `Aria<Name>`
 * constant built by `withMuxState` or `withMuxListBoxState` from one `RAC.<Name>`, marked `/** @internal *\/` and
 * `/*#__PURE__*\/`; a raw re-export (`export const AriaDateInput = RAC.DateInput`), another kind of export or a wrapper
 * of the wrong component is a finding. A component left raw renders the React Aria state names.
 */
export function substrateWrappers(text) {
  const sf = parse(text);
  const problems = [];
  const wrapped = [];
  for (const statement of sf.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      problems.push(`line ${lineOf(sf, statement)}: an export that is not a wrapper declaration`);
      continue;
    }
    if (!ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (!ts.isVariableStatement(statement)) {
      problems.push(`line ${lineOf(sf, statement)}: an exported ${ts.SyntaxKind[statement.kind]}; only Aria wrappers are exported`);
      continue;
    }
    const comments = text.slice(statement.getFullStart(), statement.getStart(sf));
    for (const declaration of statement.declarationList.declarations) {
      const name = ts.isIdentifier(declaration.name) ? declaration.name.text : '';
      const where = `line ${lineOf(sf, declaration)} ${name}`;
      const init = unwrapInputState(declaration.initializer);
      if (!/^Aria[A-Z]/u.test(name)) problems.push(`${where}: not named Aria<Name>`);
      if (!/@internal/u.test(comments)) problems.push(`${where}: no @internal comment`);
      if (!/\/\*#__PURE__\*\//u.test(text.slice(declaration.getFullStart(), declaration.initializer?.getStart(sf) ?? declaration.getEnd()))) problems.push(`${where}: no /*#__PURE__*/ annotation`);
      if (!init || !ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || !builders.has(init.expression.text)) {
        problems.push(`${where}: not built by withMuxState or withMuxListBoxState`);
        continue;
      }
      const target = init.arguments[0];
      if (!target || !ts.isPropertyAccessExpression(target) || !ts.isIdentifier(target.expression) || target.expression.text !== 'RAC') {
        problems.push(`${where}: does not wrap a React Aria export`);
        continue;
      }
      if (name !== `Aria${target.name.text.replace(/^UNSTABLE_/u, '')}`) problems.push(`${where}: wraps ${target.name.text}`);
      if (init.expression.text === 'withMuxState' && init.arguments.length < 2) problems.push(`${where}: no element`);
      wrapped.push(target.name.text);
    }
  }
  for (const component of wrapped.filter((name, index) => wrapped.indexOf(name) !== index)) problems.push(`${component} is wrapped twice`);
  return { problems, wrapped };
}

/**
 * The React Aria Components value imports outside the substrate that set no closed-list state attribute (checked
 * against the installed package by `racStateWriters`): contexts and state contexts, hooks, triggers, providers and
 * elements that carry no state of their own. Anything else is either wrapped in the substrate or a finding.
 */
export const reviewedRacImports = Object.freeze([
  'Autocomplete', 'Breadcrumbs', 'ButtonContext', 'CalendarGrid', 'CalendarGridBody', 'CalendarGridHeader', 'CalendarHeaderCell',
  'CalendarHeading', 'CalendarStateContext', 'Collection', 'ColorAreaContext', 'ColorFieldStateContext', 'ColorPicker',
  'ColorPickerStateContext', 'ColorSliderStateContext', 'ColorSwatch', 'DEFAULT_SLOT', 'Dialog', 'DialogContext', 'DialogTrigger',
  'DisclosurePanel', 'FieldError', 'FieldInputContext', 'FileTrigger', 'Focusable', 'Form', 'GridLayout', 'Header', 'Heading',
  'InputContext', 'Label', 'ListBoxSection', 'ListLayout', 'MenuSection', 'MenuTrigger', 'OverlayTriggerStateContext',
  'PopoverContext', 'Pressable', 'PreviewTrigger', 'ProgressBar', 'RadioGroupStateContext', 'RangeCalendarStateContext',
  'RootMenuTriggerStateContext', 'Separator', 'Size', 'SubmenuTrigger', 'TabPanels', 'TagGroup', 'Text', 'TextContext',
  'TokenFieldValue', 'TooltipContext', 'TooltipTrigger', 'TreeItemContent', 'UNSTABLE_ToastContent', 'UNSTABLE_ToastQueue',
  'Virtualizer', 'VisuallyHidden', 'parseColor', 'useFilter', 'useLocale', 'useSlottedContext',
]);

/**
 * Exports that do reach a closed-list write and are not wrapped, each with why that is safe. FileTrigger is the only one
 * Mux imports; the others are unused, and importing one fails the import check until it is wrapped or reviewed.
 */
export const reviewedRacWriters = Object.freeze({
  FileTrigger: 'its hidden file input is a React Aria Input that receives no state: FileTrigger passes none and Mux renders no InputContext around it',
  ComboBoxValue: 'not imported by Mux',
  SelectionIndicator: 'not imported by Mux',
  SharedElement: 'not imported by Mux',
  ColumnResizer: 'not imported by Mux',
});

/** The react-aria values (hooks and utilities, `module:name`) outside React Aria Components that Mux imports; none writes an attribute. */
export const reviewedAriaImports = Object.freeze([
  'react-aria/FocusScope:FocusScope', 'react-aria/mergeRefs:mergeRefs', 'react-aria/private/focus/FocusScope:createFocusManager',
  'react-aria/private/interactions/useFocusVisible:getInteractionModality', 'react-aria/private/utils/isFocusable:isFocusable',
  'react-aria/private/utils/runAfterTransition:runAfterTransition', 'react-aria/useInteractOutside:useInteractOutside', 'react-aria:useField',
]);

const RAC_PACKAGE = /^react-aria-components(?:\/|$)/u;
const ARIA_PACKAGE = /^(?:react-aria|react-stately|@react-aria\/[\w-]+|@react-stately\/[\w-]+)(?:\/|$)/u;
const kindOf = (fileName) => (/\.tsx$/u.test(fileName) ? ts.ScriptKind.TSX : /\.m?ts$/u.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
const sourceFile = (text, fileName) => ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, kindOf(fileName));
const lineAt = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const kebab = (camel) => camel.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

/**
 * What is wrong with the React Aria imports of one source file. A value import from React Aria Components, from the
 * package or from one of its subpaths (`react-aria-components/ColorThumb`), must be a name the substrate does not wrap
 * and the reviewed list holds; a namespace import, a re-export, a dynamic import, a `require`, an `import x = require()`
 * or a path into node_modules is never allowed, because it can reach a wrapped component without naming it, and a
 * dynamic import whose specifier is not a literal cannot be read at all. Value imports from react-aria and
 * react-stately must be on the reviewed list. Type-only imports are free.
 */
export function reactAriaImportProblems(text, fileName, wrapped, { racNames = reviewedRacImports, ariaNames = reviewedAriaImports } = {}) {
  const sf = sourceFile(text, fileName);
  const problems = [];
  const wrappedSet = new Set(wrapped);
  const racSet = new Set(racNames);
  const ariaSet = new Set(ariaNames);
  const isRac = (specifier) => RAC_PACKAGE.test(specifier);
  const isAria = (specifier) => ARIA_PACKAGE.test(specifier);
  const isPath = (specifier) => /(?:^|\/)node_modules\/|(?:^|\/)(?:react-aria-components|react-aria|react-stately)\//u.test(specifier) && !isRac(specifier) && !isAria(specifier);
  const name = (n) => (n.propertyName ?? n.name).text;
  const checkNamed = (specifier, imported, node) => {
    if (isRac(specifier)) {
      if (/^react-aria-components\/private(?:\/|$)/u.test(specifier)) problems.push(`line ${lineAt(sf, node)}: ${specifier} is a private subpath`);
      if (wrappedSet.has(imported)) problems.push(`line ${lineAt(sf, node)}: ${imported} is wrapped; import Aria${imported.replace(/^UNSTABLE_/u, '')} from the substrate`);
      else if (!racSet.has(imported)) problems.push(`line ${lineAt(sf, node)}: ${imported} from react-aria-components is neither wrapped nor reviewed`);
    } else if (!ariaSet.has(`${specifier}:${imported}`)) problems.push(`line ${lineAt(sf, node)}: ${imported} from ${specifier} is not reviewed`);
  };
  (function visit(node) {
    if ((ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) && ts.isStringLiteral(node.moduleSpecifier) && isPath(node.moduleSpecifier.text)) {
      problems.push(`line ${lineAt(sf, node)}: ${node.moduleSpecifier.text} reaches into a package directory`);
    } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && (isRac(node.moduleSpecifier.text) || isAria(node.moduleSpecifier.text))) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause && !clause.isTypeOnly) {
        if (clause.name) problems.push(`line ${lineAt(sf, node)}: a default import from ${specifier}`);
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) problems.push(`line ${lineAt(sf, node)}: a namespace import from ${specifier}`);
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) if (!element.isTypeOnly) checkNamed(specifier, name(element), node);
        }
      } else if (!clause) problems.push(`line ${lineAt(sf, node)}: a bare import of ${specifier}`);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && (isRac(node.moduleSpecifier.text) || isAria(node.moduleSpecifier.text)) && !node.isTypeOnly) {
      const specifier = node.moduleSpecifier.text;
      if (!node.exportClause || !ts.isNamedExports(node.exportClause)) problems.push(`line ${lineAt(sf, node)}: export * from ${specifier}`);
      else for (const element of node.exportClause.elements) if (!element.isTypeOnly) problems.push(`line ${lineAt(sf, node)}: ${name(element)} is re-exported from ${specifier}`);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)
      && (isRac(node.moduleReference.expression.text) || isAria(node.moduleReference.expression.text) || isPath(node.moduleReference.expression.text))) {
      problems.push(`line ${lineAt(sf, node)}: an import-equals of ${node.moduleReference.expression.text}`);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteralLike(argument)) problems.push(`line ${lineAt(sf, node)}: a dynamic import or require whose specifier is not a string literal`);
      else if (isRac(argument.text) || isAria(argument.text) || isPath(argument.text)) problems.push(`line ${lineAt(sf, node)}: a dynamic import or require of ${argument.text}`);
    }
    ts.forEachChild(node, visit);
  })(sf);
  return problems;
}

const ATTRIBUTE = /(?<![\w-])data-[a-z][a-z0-9-]*/gu;

/**
 * Every `data-*` attribute a script names that is in `forbidden`: in a string or template part (an object key, a
 * method argument, a selector), a regular expression, a JSX attribute name or a `dataset` access, plus any attribute
 * name built at run time (a template that ends in `data-`), which cannot be checked and so is reported as `data-${...}`.
 */
export function scriptAttributeFindings(text, fileName, forbidden) {
  const sf = sourceFile(text, fileName);
  const banned = new Set(forbidden);
  const found = [];
  const add = (attribute, node, via) => found.push({ attribute, line: lineAt(sf, node), via });
  const scan = (node, content, via) => { for (const [match] of content.matchAll(ATTRIBUTE)) if (banned.has(match)) add(match, node, via); };
  (function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      scan(node, node.text, 'string');
      // A name built at run time from a prefix of a forbidden name (`data-` or `data-focus-`) cannot be checked statically.
      const prefix = (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) ? /(?<![\w-])(data-(?:[a-z0-9]+-)*)$/u.exec(node.text)?.[1] : undefined;
      if (prefix !== undefined && [...banned].some((name) => name.startsWith(prefix))) add('data-${...}', node, 'template');
    } else if (ts.isRegularExpressionLiteral(node)) scan(node, node.text, 'regex');
    else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && banned.has(node.name.text)) add(node.name.text, node, 'jsx');
    else if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'dataset' && banned.has(`data-${kebab(node.name.text)}`)) add(`data-${kebab(node.name.text)}`, node, 'dataset');
    else if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'dataset') {
      if (ts.isStringLiteralLike(node.argumentExpression)) { if (banned.has(`data-${kebab(node.argumentExpression.text)}`)) add(`data-${kebab(node.argumentExpression.text)}`, node, 'dataset'); }
      else add('dataset[...]', node, 'dataset');
    }
    ts.forEachChild(node, visit);
  })(sf);
  return found;
}

/** Every attribute in `forbidden` that a stylesheet selects or reads with `attr()`; comments do not count. */
export function styleAttributeFindings(css, forbidden) {
  const banned = new Set(forbidden);
  const code = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  return [...code.matchAll(/\[\s*(data-[a-z][a-z0-9-]*)(?=[\]=~|^$*\s])|attr\(\s*(data-[a-z][a-z0-9-]*)/gu)]
    .map((match) => ({ attribute: match[1] ?? match[2], via: match[1] ? 'selector' : 'attr' }))
    .filter(({ attribute }) => banned.has(attribute));
}

/**
 * The selectors in `css` that compare the value of a presence-only boolean state (`[data-muxui-state-disabled='true']`,
 * `~=`, `^=`, ...). A boolean state is selected by its presence, so a comparison never matches what an author expects and
 * stops matching when a writer changes the value it sets; enumerated states (`orientation`, `placement`, ...) carry a value
 * and may be compared. Comments do not count.
 */
export function booleanValueSelectors(css, booleanStates) {
  const booleans = new Set(booleanStates);
  const code = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  return [...code.matchAll(/\[\s*data-muxui-state-([a-z][a-z0-9-]*)\s*([~|^$*]?=)[^\]]*\]/gu)]
    .filter(([, name]) => booleans.has(name)).map(([selector]) => selector);
}

/** The source files under `root` with one of `extensions`, as sorted paths relative to `root`, skipping declaration files. */
export function listSources(root, extensions) {
  const out = [];
  (function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (extensions.some((extension) => entry.name.endsWith(extension)) && !/\.d\.m?ts$/u.test(entry.name)) out.push(relative(root, path));
    }
  })(root);
  return out.sort();
}

/**
 * Every public React Aria Components export that can reach a write of one of `attributes` (state attributes such as
 * `data-disabled`), read from the installed package. Its modules are compiled with hashed, globally unique names, so one
 * identifier graph over `dist/private` is enough: an export reaches a write when a binding it references, directly or
 * through other components, has the attribute as an object key. That over-approximates (a component that only names
 * another component reaches its writes), which is the safe side: every writer must be wrapped or reviewed by name.
 */
export function racStateWriters(manifestPath, attributes) {
  const dir = join(dirname(createRequire(manifestPath).resolve('react-aria-components/package.json')), 'dist/private');
  const closed = new Set(attributes);
  const bindings = new Map();
  const aliases = new Map();
  const publicNames = new Map();
  for (const file of readdirSync(dir).filter((entry) => entry.endsWith('.mjs'))) {
    const sf = ts.createSourceFile(file, readFileSync(join(dir, file), 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
    const scan = (node) => {
      const binding = { refs: new Set(), writes: new Set() };
      (function visit(child) {
        if (ts.isIdentifier(child)) binding.refs.add(child.text);
        if (ts.isStringLiteral(child) && closed.has(child.text) && ts.isPropertyAssignment(child.parent) && child.parent.name === child) binding.writes.add(child.text);
        ts.forEachChild(child, visit);
      })(node);
      return binding;
    };
    for (const statement of sf.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        for (const element of statement.importClause.namedBindings.elements) if (element.propertyName) aliases.set(element.name.text, element.propertyName.text);
      } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) publicNames.set(element.name.text, (element.propertyName ?? element.name).text);
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) bindings.set(declaration.name.text, scan(declaration.initializer ?? declaration));
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        bindings.set(statement.name.text, scan(statement));
      }
    }
  }
  const writers = new Map();
  for (const [name, local] of publicNames) {
    if (!/^(?:UNSTABLE_)?[A-Z]/u.test(name)) continue;
    const seen = new Set();
    const writes = new Set();
    for (const stack = [local]; stack.length;) {
      const top = stack.pop();
      const current = bindings.has(top) ? top : aliases.get(top);
      if (!current || seen.has(current) || !bindings.has(current)) continue;
      seen.add(current);
      for (const write of bindings.get(current).writes) writes.add(write);
      stack.push(...bindings.get(current).refs);
    }
    if (writes.size) writers.set(name, [...writes].sort());
  }
  return writers;
}

/**
 * The reflected props and family statuses Mux writes, with the name each had before CSS Stage 2: `data-<name>` became
 * `data-muxui-<name>`, except Sidebar's `data-density`, which would collide with the theme scope `data-muxui-density`.
 */
export const renamedPropAttributes = Object.freeze({
  'data-size': 'data-muxui-size',
  'data-variant': 'data-muxui-variant',
  'data-color': 'data-muxui-color',
  'data-collapsed': 'data-muxui-collapsed',
  'data-foldable': 'data-muxui-foldable',
  'data-change': 'data-muxui-change',
  'data-status': 'data-muxui-status',
  'data-complete': 'data-muxui-complete',
  'data-phase': 'data-muxui-phase',
  'data-instruction': 'data-muxui-instruction',
  'data-wrap': 'data-muxui-wrap',
  'data-shape': 'data-muxui-shape',
  'data-two-tone': 'data-muxui-two-tone',
  'data-static': 'data-muxui-static',
  'data-hidden': 'data-muxui-hidden',
  'data-sender': 'data-muxui-sender',
  'data-selectable': 'data-muxui-selectable',
  'data-align': 'data-muxui-align',
  'data-part': 'data-muxui-part',
  'data-motion-pressed': 'data-muxui-motion-pressed',
  'data-attached': 'data-muxui-attached',
  'data-card-type': 'data-muxui-card-type',
  'data-mode': 'data-muxui-mode',
  'data-language': 'data-muxui-language',
  'data-line-number': 'data-muxui-line-number',
  'data-line-numbers': 'data-muxui-line-numbers',
  'data-copy-state': 'data-muxui-copy-state',
  'data-diff-strategy': 'data-muxui-diff-strategy',
  'data-marker': 'data-muxui-marker',
  'data-row-id': 'data-muxui-row-id',
  'data-streaming': 'data-muxui-streaming',
  'data-panel-id': 'data-muxui-panel-id',
  'data-handle-id': 'data-muxui-handle-id',
  'data-modal': 'data-muxui-modal',
  'data-selection-traveling': 'data-muxui-selection-traveling',
  'data-error': 'data-muxui-error',
  'data-loaded': 'data-muxui-loaded',
  'data-image-state': 'data-muxui-image-state',
  'data-fallback': 'data-muxui-fallback',
  'data-markdown-error': 'data-muxui-markdown-error',
  'data-density': 'data-muxui-sidebar-density',
});

/**
 * Text no longer to be read as current: records of what was decided or measured then, and design mockups that carry their
 * own markup and styles and never load the shipped stylesheet. They keep the names they were written with.
 */
export const historicalPaths = Object.freeze({
  'decisions/': 'decision records state what the attributes were when they were decided',
  'tests/evidence/': 'review evidence records what was reviewed',
  'packages/react/advisory/': 'advisory mockups are self-contained pages with their own styles',
});

/**
 * The renamed names that are not Mux's in a path: another product's attribute that happens to share a name. Each entry
 * must still occur in its path, so a stale exemption fails.
 */
export const foreignAttributes = Object.freeze([
  { path: 'apps/docs/', names: ['data-dragging', 'data-mode'], reason: 'the docs block viewer owns them' },
  { path: 'apps/react-storybook/.storybook/theme.mjs', names: ['data-selected', 'data-hovered'], reason: "Storybook's manager UI sets them on its own elements" },
  { path: 'apps/react-storybook/.storybook/component-docs-page.mjs', names: ['data-part', 'data-type', 'data-${...}'], reason: "the component docs page marks its own parts, type declarations and closing rows" },
  { path: 'apps/react-storybook/.storybook/preview.css', names: ['data-part'], reason: "the component docs page marks its own parts" },
  { path: 'apps/react-storybook/test/typed-reference.test.mjs', names: ['data-part', 'data-type', 'data-${...}'], reason: "reads the docs page's own markers" },
  { path: 'apps/react-storybook/test/storybook-a11y.test.mjs', names: ['data-part', 'data-type'], reason: "reads the docs page's own markers" },
  { path: 'apps/react-storybook/test/storybook-colors.test.mjs', names: ['data-status', 'data-hovered', 'data-selected'], reason: "draws and reads Storybook's manager UI" },
  { path: 'apps/scale/test/browser/docs-blocks.test.mjs', names: ['data-mode'], reason: 'reads the docs block viewer' },
  { path: 'packages/react/test/browser/data-diff.test.mjs', names: ['data-${...}'], reason: 'the template builds screenshot file names that start with data-diff-' },
  { path: 'catalog/patterns/agent-trace/', names: ['data-open'], reason: "the pattern's own element marks its disclosure" },
  { path: 'packages/react/test/browser/pattern-agent-trace.test.mjs', names: ['data-open'], reason: "reads the pattern's own element" },
  { path: 'packages/react/README.md', names: ['data-placeholder', 'data-disabled'], reason: 'the README names the two attributes React Aria keeps, the date segments\' data-placeholder and the hidden picker input\'s data-disabled' },
  { path: 'packages/react/src/generate.mjs', names: ['data-placeholder', 'data-disabled'], reason: 'the README text it generates names them' },
  { path: 'packages/react/src/text-editor/text-editor.css', names: ['data-placeholder'], reason: "Tiptap's Placeholder extension writes it and the stylesheet reads it with attr()" },
  { path: 'tooling/audits/repository-policy/test/component-source-impact.test.mjs', names: ['data-hovered', 'data-disabled', 'data-selected', 'data-indeterminate', 'data-focused'], reason: 'selector text handed to the planner as an example' },
]);

/** Files that define or probe the old names on purpose. */
export const probePaths = Object.freeze([
  'packages/react/src/substrate.ts', 'packages/react/src/styling-contract.ts',
  'packages/react/test/support/attribute-guard.mjs', 'packages/react/test/support/state-matrix.mjs',
  'packages/react/test/styling-tokens.test.mjs', 'packages/react/test/substrate.test.mjs',
  // Asserts on the wording of the retained advisory text, which keeps the names it was written with.
  'packages/react/test/capability-enrichment.test.mjs',
]);

/** Every use of a name in `forbidden` in one file, by what kind of file it is: stylesheet, script or other text. */
export function attributeFindingsIn(path, text, forbidden) {
  const banned = [...forbidden];
  if (!text.includes('data-') && !text.includes('dataset')) return [];
  if (/\.css$/u.test(path)) return styleAttributeFindings(text, banned).map(({ attribute, via }) => ({ attribute, via }));
  if (/\.(?:mjs|cjs|js|jsx|ts|tsx|mts|cts)$/u.test(path)) return scriptAttributeFindings(text, path, banned).map(({ attribute, via, line }) => ({ attribute, via, line }));
  const set = new Set(banned);
  return [...text.matchAll(ATTRIBUTE)].map(([attribute]) => attribute).filter((attribute) => set.has(attribute)).map((attribute) => ({ attribute, via: 'text' }));
}
