// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.

/** One highlighted span of a line: its text, and the semantic content role its colour maps to. */
export interface CodeToken {
  text: string;
  role: 'strong' | 'link' | undefined;
}

/** The tokens of each line of each source, or null when the language is plain, unknown, over budget, or fails to load. */
export declare function highlightCodeDocuments(sources: readonly string[], language: string | undefined): Promise<CodeToken[][][] | null>;
