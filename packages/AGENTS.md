# Package navigation

Each package owns its manifest, detailed scripts, implementation, exports, and
package-local checks. Use workspace dependencies for cross-package ordering;
do not copy package tasks into the root script surface.

Choose the smallest sufficient proof for the changed behavior. Use the
package-local check for package-only work, `pnpm check --component
<family-or-slug>` for a component or related family, `pnpm check --package
<name|path>` for a package and its required dependents, or `pnpm check --files
<path[,path]>` to scope the task to exact files. Explicit scopes ignore
unrelated concurrent dirty files; unscoped `pnpm check` discovers changed
owners and dependents and generates only their prerequisites.

Use `pnpm generate --package <name|path>` when package prerequisites need
scoping; plain `pnpm generate` remains full. Style-only component work needs
scoped family checks and relevant visual evidence. Shared styles, tokens,
runtime, or API changes broaden to their actual owners and dependents. Reuse
unchanged evidence and expand only for relevant failures. Focused reports are
partial proof, never full release proof; use `pnpm check:all` or release
preparation for shared workspace or dependency changes, release work, or an
explicit all request.
