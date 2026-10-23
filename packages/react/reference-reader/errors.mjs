/**
 * The named failure of the declaration reader (Decision 0031 typed rendering). A construct the reader
 * does not admit never degrades to opaque text: generation stops with the code, the chain that reached
 * it, and what is wrong, so the tranche that introduced the construct decides how to read it.
 *
 * Codes:
 * - DIAGNOSTICS: the declarations do not compile cleanly, or a name in them does not resolve.
 * - UNSUPPORTED: a syntax node or operation the reader has no exact reading of.
 * - OVERLOAD, MERGED: one exported name with several signatures or several declarations of one meaning.
 * - CYCLE: a type alias chain that never reaches a type.
 * - ORIGIN: a name that resolves outside the package, React and the default library.
 * - HOST: the compiler host does not match the contract the reader relies on.
 * - OWNERSHIP, INVENTORY: an export without exactly one owner, or an export-map entry the inventory misses.
 */
export class ReferenceReadError extends Error {
  /**
   * @param {string} code
   * @param {string} chain Where the reader was: the entry point, the declaration, the member.
   * @param {string} message
   */
  constructor(code, chain, message) {
    super(`MUXUI_REACT_REFERENCE_${code}: ${chain}: ${message}`);
    this.name = 'ReferenceReadError';
    this.code = `MUXUI_REACT_REFERENCE_${code}`;
    this.chain = chain;
  }
}
