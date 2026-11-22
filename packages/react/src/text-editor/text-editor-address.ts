/**
 * TextEditor's address rule for links and images: one rule for its commands, its document grammar and its Markdown
 * converters. The module imports nothing, so the converters bring none of the editor with them.
 */

const LINK_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);
const IMAGE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * The address as a link or an image keeps it, or null where the rule refuses it. A link takes an absolute http, https or
 * mailto URL and an image an absolute http or https one, with no user name or password, no surrounding space and no control
 * character. The result is the URL's normalized form, which the rule keeps as it is, so normalizing twice gives what
 * normalizing once gave. One exception, a known defect: the mailto user-name check reads the address as given, so a line
 * separator between a colon and the `@` passes once and fails once the normalized form escapes it.
 */
export function normalizeAddress(value: unknown, kind: 'link' | 'image'): string | null {
  const protocols = kind === 'link' ? LINK_PROTOCOLS : kind === 'image' ? IMAGE_PROTOCOLS : null;
  if (protocols === null || typeof value !== 'string' || value.length === 0 || value.trim() !== value) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || (code >= 127 && code <= 159)) return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!protocols.has(url.protocol) || url.username !== '' || url.password !== '') return null;
  if (url.protocol === 'mailto:' && mailtoUserName(value)) return null;
  return url.href;
}

/**
 * Whether a mailto address names a user and password before its `@`: a colon before any `/`, `?` or `#`, then an `@`
 * later on the same line. One pass, so a long address costs linear time where a backtracking pattern costs quadratic.
 */
function mailtoUserName(value: string): boolean {
  let colon = false;
  let beforePath = true;
  for (let index = 'mailto:'.length; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x2028 || code === 0x2029) {
      // A colon before a line separator cannot reach an `@` after it.
      colon = false;
    } else if (code === 64 && colon) {
      return true;
    } else if (code === 47 || code === 63 || code === 35) {
      beforePath = false;
    } else if (code === 58 && beforePath) {
      colon = true;
    }
  }
  return false;
}
