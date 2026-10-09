import assert from 'node:assert/strict';
import test from 'node:test';
import { createHighlighterCore, guessEmbeddedLanguages } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { bundledLanguages } from 'shiki/langs';
import { highlightCodeDocuments } from '../src/supplemental/code-block-highlight.mjs';

// Full-document Shiki output is the independent reference for chunk boundaries.
const theme = {
  name: 'reference', type: 'dark', colors: { 'editor.foreground': '#111111' },
  settings: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#111111' } },
    { scope: ['string', 'constant.other.symbol', 'entity.name.tag', 'support.class.component'], settings: { foreground: '#222222' } },
    { scope: ['keyword', 'storage', 'entity.name.function', 'support.function', 'constant.numeric', 'constant.language'], settings: { foreground: '#333333' } },
  ],
};
const samples = [
  ['typescript', 'const value = `start\r\n${1 + 2}\r\nend`;\r\n/* open\r\nconst ignored = 3;\r\n*/\r\nexport function next() {}\r\n'],
  ['python', 'text = """first\nsecond\nlast"""\n# comment\nprint(text)\n'],
  ['bash', 'cat <<EOF\nhello $USER\nEOF\nprintf "%s" done\n'],
  ['markdown', '# Example\n\n```typescript\n/* open\nconst comment = 1;\n*/\nconst value = "text";\n```\nend\n'],
  ['html', '<script>\n/* open\ncomment\n*/\nconst value = "text";\n</script>\n<style>\np { color: red; }\n</style>\n'],
];

test('ordered grammar state matches complete documents, including embedded grammars and CRLF', async () => {
  const names = new Set(samples.flatMap(([language, source]) => [language, ...guessEmbeddedLanguages(source, language)]));
  const reference = await createHighlighterCore({
    themes: [theme], langs: [...names].filter((name) => Object.hasOwn(bundledLanguages, name)).map((name) => bundledLanguages[name]),
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  try {
    for (const [language, source] of samples) {
      const [actual] = await highlightCodeDocuments([source], language) ?? [];
      assert.ok(actual, `${language} highlights within the workload budget`);
      assert.equal(actual.map((line) => line.map((token) => token.text).join('')).join('\n'), source);
      const expected = reference.codeToTokens(source, { lang: language, theme: 'reference' }).tokens;
      const characters = (line) => line.flatMap((token) => Array.from(token.text ?? token.content, (character) => [character, token.role ?? ({ '#222222': 'strong', '#333333': 'link' })[token.color]]));
      for (let index = 0; index < expected.length; index++) {
        // Shiki excludes a CRLF delimiter's CR; Mux retains it without a color.
        assert.deepEqual(characters(actual[index]).filter(([character]) => character !== '\r'), characters(expected[index]), `${language} line ${index + 1}`);
      }
    }
  } finally { reference.dispose(); }
});

test('aliases are safe, whitespace is exact, and unsupported languages and complete-input bounds fall back', async () => {
  const source = '\tconst value = "<script>&text</script>";\r\n\n  trailing  \n\r\u2028';
  const canonical = await highlightCodeDocuments([source], 'typescript');
  assert.deepEqual(await highlightCodeDocuments([source], ' TS '), canonical);
  assert.equal(canonical[0].map((line) => line.map((token) => token.text).join('')).join('\n'), source);
  for (const language of [undefined, '', 'plain', 'text', 'txt', 'plaintext', 'none', 'ansi', '__proto__', 'constructor', '../../typescript', 'missing-language']) {
    assert.equal(await highlightCodeDocuments([source], language), null, String(language));
  }
  for (const documents of [['x'.repeat(2_001)], ['\n'.repeat(500)], Array(26).fill('x'.repeat(2_000))]) {
    assert.equal(await highlightCodeDocuments(documents, 'typescript'), null);
  }
  assert.ok(await highlightCodeDocuments(['x'.repeat(2_000)], 'typescript'));
  assert.ok(await highlightCodeDocuments(['\n'.repeat(499)], 'typescript'));
  assert.equal(await highlightCodeDocuments(['const x = 1;', '"x";'.repeat(499) + '\n' + '"x";'.repeat(499)].concat(Array(20).fill('"x";'.repeat(499))), 'typescript'), null, 'token output cap applies across both documents');
  const crlfTokens = Array(20).fill('"x";'.repeat(499)).concat('"x";'.repeat(10)).join('\r\n') + '\r\n';
  assert.equal(await highlightCodeDocuments([crlfTokens], 'typescript'), null, 'restored CR spans count toward the output cap');
  const fenced = Array.from({ length: 9 }, (_, i) => '```' + ['js', 'ts', 'python', 'ruby', 'go', 'rust', 'java', 'css', 'html'][i] + '\nx\n```').join('\n');
  assert.equal(await highlightCodeDocuments([fenced], 'markdown'), null, 'optional embedded grammar loads are bounded');
});

test('cooperative aggregate cutoff discards all partial output before another line starts', async (context) => {
  await highlightCodeDocuments(['const warm = 1;'], 'typescript');
  let reads = 0;
  context.mock.method(performance, 'now', () => reads++ < 2 ? 0 : 501);
  assert.equal(await highlightCodeDocuments(['const first = 1;\nconst second = 2;'], 'typescript'), null);
  assert.equal(reads, 3, 'one elapsed check before and after the first line');
});
