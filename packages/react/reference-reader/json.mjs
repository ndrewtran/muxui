/**
 * The one serializer of the committed reference files. It is JSON.stringify with two-space indentation, except
 * that an array of scalars stays on one line and so does a short object of scalars, so a member list reads as a
 * list and a diff shows one changed value as one changed line. The output is plain JSON; only the layout is chosen.
 */
const scalar = (value) => value === null || typeof value !== 'object';
const LINE_LIMIT = 100;

function format(value, indent) {
  if (scalar(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(scalar)) {
      const line = `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
      if (indent.length + line.length <= LINE_LIMIT) return line;
    }
    const inner = `${indent}  `;
    return `[\n${value.map((item) => `${inner}${format(item, inner)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (entries.length === 0) return '{}';
  if (entries.every(([, item]) => scalar(item))) {
    const line = `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(', ')} }`;
    if (indent.length + line.length <= LINE_LIMIT) return line;
  }
  const inner = `${indent}  `;
  return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${format(item, inner)}`).join(',\n')}\n${indent}}`;
}

export const formatJson = (value) => `${format(value, '')}\n`;
