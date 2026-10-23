/**
 * The one printer of the declaration reference. It prints a graph type tree exactly as the declaration
 * wrote it, in the order it wrote it: literal unions keep their source order, an optional member keeps
 * its written `never` or `| undefined`, a method stays a method and a function property stays one. The
 * compiler's own printer does none of this (TypeScript 6 and 7 order literal unions differently, and both
 * print `x?: never` as `x?: undefined`), so nothing downstream prints a type any other way.
 *
 * The output is deterministic text and nothing else: no absolute path, no compiler version, no
 * insertion-order artefact.
 */

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

const quote = (text) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
const memberKey = (name) => (IDENTIFIER.test(name) ? name : quote(name));

/** How tightly a type binds, so a printer can parenthesize exactly what the grammar needs. */
function precedence(type) {
  switch (type.kind) {
    case 'union': return type.members.length > 1 ? 1 : 3;
    case 'intersection': return type.members.length > 1 ? 2 : 3;
    case 'function': case 'predicate': return 0;
    case 'keyof': case 'readonly': return 3;
    default: return 4;
  }
}

const wrap = (type, minimum, text) => (precedence(type) < minimum ? `(${text})` : text);

export function printTypeParameters(typeParameters) {
  if (typeParameters === undefined) return '';
  return `<${typeParameters.map((parameter) => `${parameter.name}${parameter.constraint ? ` extends ${printType(parameter.constraint)}` : ''}${parameter.default ? ` = ${printType(parameter.default)}` : ''}`).join(', ')}>`;
}

function printParameters(parameters) {
  return `(${parameters.map((parameter) => `${parameter.rest ? '...' : ''}${parameter.name}${parameter.optional ? '?' : ''}: ${printType(parameter.type)}`).join(', ')})`;
}

function printReturn(type) {
  if (type.kind !== 'predicate') return printType(type);
  const subject = type.type ? `${type.parameter} is ${printType(type.type)}` : type.parameter;
  return type.asserts ? `asserts ${subject}` : subject;
}

/** `(params): Return`, the call form a method or call signature prints after its name. */
export function printCallSignature(signature) {
  return `${printTypeParameters(signature.typeParameters)}${printParameters(signature.parameters)}: ${printReturn(signature.returnType)}`;
}

/** One member as the declaration wrote it, without its comment or terminating semicolon. */
export function printMember(member) {
  switch (member.member) {
    case 'property': return `${member.readonly ? 'readonly ' : ''}${memberKey(member.name)}${member.optional ? '?' : ''}: ${printType(member.type)}`;
    case 'method': return `${memberKey(member.name)}${member.optional ? '?' : ''}${printCallSignature(member)}`;
    case 'call': return printCallSignature(member);
    case 'index': return `${member.readonly ? 'readonly ' : ''}[${member.parameter.name}: ${printType(member.parameter.type)}]: ${printType(member.type)}`;
    default: throw new Error(`MUXUI_REACT_REFERENCE_HOST: no printer for the member kind ${member.member}`);
  }
}

const printArguments = (typeArguments) => (typeArguments === undefined ? '' : `<${typeArguments.map(printType).join(', ')}>`);

/** A type on one line. */
export function printType(type) {
  switch (type.kind) {
    case 'keyword': return type.name;
    case 'literal': return typeof type.value === 'string' ? quote(type.value) : String(type.value);
    case 'reference': case 'host': return `${type.name}${printArguments(type.typeArguments)}`;
    case 'parameter': return type.name;
    case 'union': return type.members.map((member) => wrap(member, 3, printType(member))).join(' | ');
    case 'intersection': return type.members.map((member) => wrap(member, 3, printType(member))).join(' & ');
    case 'array': return `${wrap(type.element, 3, printType(type.element))}[]`;
    case 'tuple': return `[${type.elements.map((element) => `${element.rest ? '...' : ''}${element.name ? `${element.name}${element.optional ? '?' : ''}: ` : ''}${element.optional && !element.name ? wrap(element.type, 4, printType(element.type)) : printType(element.type)}${element.optional && !element.name ? '?' : ''}`).join(', ')}]`;
    case 'readonly': return `readonly ${wrap(type.type, 3, printType(type.type))}`;
    case 'keyof': return `keyof ${wrap(type.type, 3, printType(type.type))}`;
    case 'indexed': return `${wrap(type.object, 4, printType(type.object))}[${printType(type.index)}]`;
    case 'typeof': return `typeof ${type.name}`;
    case 'object': return type.members.length === 0 ? '{}' : `{ ${type.members.map(printMember).join('; ')} }`;
    case 'function': return `${printTypeParameters(type.typeParameters)}${printParameters(type.parameters)} => ${printReturn(type.returnType)}`;
    case 'predicate': return printReturn(type);
    case 'mapped': {
      const readonly = type.readonly === undefined ? '' : (type.readonly === 'readonly' ? 'readonly ' : `${type.readonly}readonly `);
      const optional = type.optional === undefined ? '' : (type.optional === '?' ? '?' : `${type.optional}?`);
      return `{ ${readonly}[${type.parameter} in ${printType(type.constraint)}${type.nameType ? ` as ${printType(type.nameType)}` : ''}]${optional}: ${printType(type.type)} }`;
    }
    default: throw new Error(`MUXUI_REACT_REFERENCE_HOST: no printer for the type kind ${type.kind}`);
  }
}

/** The members of an object body on lines of their own, as a declaration writes them. */
function printBody(members, indent) {
  if (members.length === 0) return '{}';
  const pad = ' '.repeat(indent + 2);
  return `{\n${members.map((member) => `${pad}${printMember(member)};`).join('\n')}\n${' '.repeat(indent)}}`;
}

/** A declaration's body type: object arms on lines of their own, the rest on one. */
function printBlock(type, indent) {
  if (type.kind === 'object') return printBody(type.members, indent);
  if (type.kind === 'union' || type.kind === 'intersection') {
    const separator = type.kind === 'union' ? ' | ' : ' & ';
    const arms = type.members.map((member) => wrap(member, 3, member.kind === 'object' ? printBody(member.members, indent) : printType(member)));
    return arms.join(separator);
  }
  return printType(type);
}

/** A named type as its declaration, without the comment: `type Name<T> = ...;` or `interface Name<T> extends Base { ... }`. */
export function printDeclaration(declaration) {
  const parameters = printTypeParameters(declaration.typeParameters);
  if (declaration.kind === 'interface') {
    const bases = declaration.extends === undefined ? '' : ` extends ${declaration.extends.map(printType).join(', ')}`;
    return `interface ${declaration.name}${parameters}${bases} ${printBody(declaration.members, 0)}`;
  }
  return `type ${declaration.name}${parameters} = ${printBlock(declaration.type, 0)};`;
}

/** A value a type reaches through `typeof`, as its declaration: `declare const Name: Type;` or `declare function name(...): Type;`. */
export function printValueDeclaration(declaration) {
  if (declaration.kind === 'function') return `declare function ${declaration.name}${printCallSignature(declaration)};`;
  return `declare const ${declaration.name}: ${printBlock(declaration.type, 0)};`;
}

/** Every package type a tree names, as ids in order of first appearance. */
export function referencedIds(node, found = new Set()) {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) referencedIds(item, found);
    return found;
  }
  if ((node.kind === 'reference' || node.kind === 'typeof') && typeof node.id === 'string') found.add(node.id);
  for (const value of Object.values(node)) if (value !== null && typeof value === 'object') referencedIds(value, found);
  return found;
}
