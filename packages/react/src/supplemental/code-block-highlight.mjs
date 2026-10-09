// The engine and grammars are shared; source text and tokens stay instance-owned.
let highlighterPromise;
const languageLoads = new Map();
const plainLanguages = new Set(['plain', 'text', 'txt', 'plaintext', 'none', 'ansi']);
const roles = {
  'var(--muxui-semantic-content-default)': undefined,
  'var(--muxui-semantic-content-strong)': 'strong',
  'var(--muxui-semantic-content-link)': 'link',
};
const theme = {
  name: 'mux-code-block', type: 'dark',
  colors: {
    'editor.background': 'var(--muxui-semantic-surface-raised)',
    'editor.foreground': 'var(--muxui-semantic-content-default)',
  },
  settings: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'var(--muxui-semantic-content-default)' } },
    { scope: ['string', 'constant.other.symbol', 'entity.name.tag', 'support.class.component'], settings: { foreground: 'var(--muxui-semantic-content-strong)' } },
    { scope: ['keyword', 'storage', 'entity.name.function', 'support.function', 'constant.numeric', 'constant.language'], settings: { foreground: 'var(--muxui-semantic-content-link)' } },
  ],
};

function withinBudget(sources) {
  let length = 0;
  let count = 0;
  for (const source of sources) {
    length += source.length;
    if (length > 50_000) return false;
    const lines = source.split('\n');
    count += lines.length;
    if (count > 500 || lines.some((line) => line.length > 2_000)) return false;
  }
  return true;
}

function getHighlighter() {
  highlighterPromise ??= Promise.all([
    import('shiki/core'), import('shiki/engine/oniguruma'),
  ]).then(async ([{ createHighlighterCore }, { createOnigurumaEngine }]) => createHighlighterCore({
    themes: [theme], langs: [], engine: createOnigurumaEngine(import('shiki/wasm')),
  })).catch((error) => {
    highlighterPromise = undefined;
    throw error;
  });
  return highlighterPromise;
}

function loadLanguage(highlighter, getter) {
  // Aliases share the same importer, so simultaneous aliases share one load too.
  if (!languageLoads.has(getter)) {
    const loading = highlighter.loadLanguage(getter).catch((error) => {
      languageLoads.delete(getter);
      throw error;
    });
    languageLoads.set(getter, loading);
  }
  return languageLoads.get(getter);
}

/** Private client-effect helper. Whole documents fall back together on any failure. */
export async function highlightCodeDocuments(sources, language) {
  const lang = typeof language === 'string' ? language.trim().toLowerCase() : '';
  if (!lang || plainLanguages.has(lang) || !withinBudget(sources)) return null;
  try {
    const { bundledLanguages } = await import('shiki/langs');
    if (!Object.hasOwn(bundledLanguages, lang)) return null;
    const highlighter = await getHighlighter();
    const { guessEmbeddedLanguages } = await import('shiki/core');
    const extraLanguages = new Set(sources.flatMap((source) => guessEmbeddedLanguages(source, lang))
      .filter((name) => Object.hasOwn(bundledLanguages, name)));
    if (extraLanguages.size > 8) return null;
    await Promise.all([lang, ...extraLanguages].map((name) => loadLanguage(highlighter, bundledLanguages[name])));
    let tokenCount = 0;
    const started = performance.now();
    const documents = [];
    for (const source of sources) {
      const lines = source.split('\n');
      const document = [];
      let grammarState;
      for (let index = 0; index < lines.length; index++) {
        if (performance.now() - started > 500) return null;
        // Carry full-document context through ordered lines, never diff rows.
        // Include the real delimiter so CRLF is tokenized exactly as a full source.
        const result = highlighter.codeToTokens(lines[index] + (index < lines.length - 1 ? '\n' : ''), {
          lang, theme: theme.name, grammarState,
          tokenizeTimeLimit: 600, tokenizeMaxLineLength: 2_001,
        });
        // The aggregate cutoff is below the cooperative per-line timeout: discard
        // potentially partial tokens and stop before starting another slow line.
        if (performance.now() - started > 500) return null;
        grammarState = result.grammarState;
        const tokens = result.tokens[0];
        tokenCount += tokens.length;
        if (tokenCount > 20_000) return null;
        const text = lines[index];
        let offset = 0;
        const line = [];
        for (const token of tokens) {
          const content = text.slice(offset, offset + token.content.length);
          if (content !== token.content) return null;
          line.push({ text: content, role: Object.hasOwn(roles, token.color) ? roles[token.color] : undefined });
          offset += content.length;
        }
        // CRLF tokenization omits the CR; preserve it and any unchanged remainder.
        if (offset < text.length) {
          if (++tokenCount > 20_000) return null;
          line.push({ text: text.slice(offset), role: undefined });
        }
        document.push(line);
      }
      documents.push(document);
    }
    return documents;
  } catch {
    return null;
  }
}
