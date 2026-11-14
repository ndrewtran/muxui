// The source-level half of the class rule (see unclassed-elements.mjs, which holds the rendered markup to it): a call that creates a
// native element with a literal tag must pass props that name a className. This sees every state a component can render, including
// the ones no fixture reaches (an open menu, an empty table). It decides only what the call shows: props that spread something in,
// or are not an object literal, may carry a className from the caller or from React Aria's render function, and the rendered check
// answers for those.
import ts from 'typescript-6';

/** The internals of an svg, which sit inside a classed svg and so need no class of their own. */
const svgInternals = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'g', 'defs', 'use']);

const isCreator = (text) => /^(?:React\.)?createElement$/u.test(text);

const literalTags = (node) => {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isConditionalExpression(node)) {
    const branches = [literalTags(node.whenTrue), literalTags(node.whenFalse)];
    return branches.every((tags) => tags !== undefined) ? branches.flat() : undefined;
  }
  return undefined;
};

/**
 * Each `file:line <tag>` where a native element is created without a className.
 * @param {Record<string, string>} sources Source text by path.
 */
export function unclassedSites(sources) {
  const found = [];
  for (const [file, text] of Object.entries(sources)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    // `createElement`, and each name bound to it: `const e = React.createElement`, `import { h } from './part-utils.ts'` (React's own).
    const creators = new Set(['createElement']);
    const bind = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isCreator(node.initializer.getText(source))) creators.add(node.name.text);
      if (ts.isImportSpecifier(node)) {
        const from = node.parent.parent.parent.moduleSpecifier.text;
        if ((node.propertyName ?? node.name).text === 'createElement' || ((node.propertyName ?? node.name).text === 'h' && /part-utils/u.test(from))) creators.add(node.name.text);
      }
      ts.forEachChild(node, bind);
    };
    bind(source);
    const visit = (node) => {
      if (ts.isCallExpression(node) && (creators.has(node.expression.getText(source)) || node.expression.getText(source) === 'React.createElement')) {
        const [tag, props] = node.arguments;
        const tags = tag && literalTags(tag);
        const nothing = !props || props.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(props) && props.text === 'undefined');
        const classed = props && ts.isObjectLiteralExpression(props) && props.properties.some((member) => ts.isSpreadAssignment(member) || member.name?.getText(source) === 'className');
        if (tags && tags.some((name) => !svgInternals.has(name)) && (nothing || (ts.isObjectLiteralExpression(props) && !classed))) {
          found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} <${tags.join('|')}>`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
