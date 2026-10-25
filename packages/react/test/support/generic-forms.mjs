import { parseAst } from 'vite';

/**
 * The generic forms of an emitted declaration file, as the source prints them: every declaration with type parameters, and every
 * call signature of an interface that has them, mapped to its parameter list (`T extends MultiSelectItem = MultiSelectItem`), plus
 * the printed definition of each plain alias such a list names. A test that records these as text catches a default, a constraint or
 * a parameter that changed in any one form, whether or not some witness happens to use that form's default, and an alias a list
 * names whose definition changed under it.
 * @param {string} text
 * @returns {{ forms: Record<string, string>, aliases: Record<string, string> }}
 */
export function genericForms(text) {
  const print = (node) => text.slice(node.start, node.end).replace(/\s+/gu, ' ').trim();
  const forms = {};
  const aliases = {};
  const parameters = (declaration) => {
    const params = declaration?.params ?? [];
    return params.length === 0 ? undefined : print({ start: params[0].start, end: params.at(-1).end });
  };
  for (const statement of parseAst(text, { lang: 'dts' }).body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type === 'TSTypeAliasDeclaration') {
      const list = parameters(declaration.typeParameters);
      if (list === undefined) aliases[declaration.id.name] = print(declaration.typeAnnotation);
      else forms[declaration.id.name] = list;
    } else if (declaration.type === 'TSInterfaceDeclaration') {
      const signatures = declaration.body.body.filter((member) => member.type === 'TSCallSignatureDeclaration');
      const own = parameters(declaration.typeParameters);
      if (own !== undefined) forms[declaration.id.name] = own;
      signatures.forEach((signature, index) => {
        const list = parameters(signature.typeParameters);
        if (list !== undefined) forms[`${declaration.id.name} call signature${signatures.length > 1 ? ` ${index + 1}` : ''}`] = list;
      });
    }
  }
  const named = Object.keys(aliases).filter((name) => Object.values(forms).some((list) => new RegExp(`\\b${name}\\b`, 'u').test(list)));
  return { forms, aliases: Object.fromEntries(named.map((name) => [name, aliases[name]])) };
}
