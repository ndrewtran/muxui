# Package navigation

Each package owns its manifest, detailed scripts, implementation, exports, and
package-local checks. Use workspace dependencies for cross-package ordering;
do not copy package tasks into the root script surface.

Use the package-local check for package-only work, and
`pnpm generate --package <name|path>` when package prerequisites need scoping.
Common scopes and proof rules are in the root [`AGENTS.md`](../AGENTS.md)
Verification section.
