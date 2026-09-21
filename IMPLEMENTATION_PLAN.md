# Implementation Plan

## END_RESULT

The isolated `/tmp/muxui-overlay-motion-preview` artifact opens as a bundled,
polished static review page where a reviewer can compare the three locked
motion options across CommandPalette, Dialog, and AlertDialog, switch dark and
light themes, replay A → B → C, and exercise the documented keyboard and
reduced-motion behavior from a fresh localhost URL.

### Acceptance Criteria

- [ ] AC1: The preview shows the locked motion values: A uses `y: -8`,
  `scale: 0.97`, `stiffness: 560`, `damping: 40`, `mass: 0.5`; B uses
  `y: -4` and `scale: 0.985` with A's spring/timings; C keeps A's geometry
  with `stiffness: 420`; backdrop and exit timings match `REFERENCE.md`.
- [ ] AC2: The page visibly supports dark/light switching and renders all
  three content states, with each state available through every motion option
  and with readable, responsive layout in both themes.
- [ ] AC3: Opening an overlay focuses its search/form control, and Escape,
  backdrop, close, and action controls dismiss it while restoring the launch
  control; command filtering and arrow-key selection remain usable.
- [ ] AC4: Replay runs A → B → C once and completes cleanly; reduced-motion
  mode removes transform travel and uses the documented `0.10s` fade while
  normal motion remains limited to transform and opacity.
- [ ] AC5: `index.html` loads fresh `dist/main.js` and `dist/main.css` with no
  missing-asset or console errors, and browser/local checks are completed from
  a newly chosen localhost port whose exact URL is reported.

## Assumptions

- `/tmp/muxui-overlay-motion-preview/REFERENCE.md` is the authority for this
  standalone review artifact. The tracked Mux UI repository, production,
  package manifests, commits, pushes, PRs, and releases remain out of scope.
- The existing `src/main.tsx`, `src/styles.css`, `index.html`, and current
  `dist/` output are the starting point. “Correct the harmless malformed
  apply_patch attempt” means remove any patch residue or stale/missing asset
  wiring found during implementation, not add a new feature surface.
- Reuse the workspace-installed React/Motion/esbuild toolchain for the isolated
  bundle; do not add a repository dependency or modify tracked configuration.

## Phase 1 — Finish the isolated motion preview

- [x] Audit and minimally correct `/tmp/muxui-overlay-motion-preview/src/main.tsx`
  so the A/B/C values, backdrop/exit/reduced-motion contracts, theme toggle,
  overlay selectors, focus restoration, Escape/backdrop dismissal, command
  keyboard behavior, and one-shot replay are all represented by the existing
  UI. Remove any malformed patch residue found in the target. [wave:1]
- [x] Polish `/tmp/muxui-overlay-motion-preview/src/styles.css` and
  `index.html` in the existing dense black/white visual language, preserving
  readable dark/light states, responsive cards and overlays, visible focus,
  and the `dist/main.js`/`dist/main.css` entry paths. [wave:1]
- [x] Regenerate `/tmp/muxui-overlay-motion-preview/dist/main.js` and
  `dist/main.css` from the isolated source with the existing workspace
  bundler, then verify the output contains the corrected source contract and
  has no unresolved imports or stale asset references. [needs:src/main.tsx + styles.css + index.html]
- [ ] Serve the isolated directory on a fresh unused localhost port and run
  browser/local QA for both themes, A/B/C, all three overlay states, focus and
  dismissal paths, filtering/arrow keys, replay completion, reduced motion,
  responsive layout, asset requests, and console cleanliness. Record the exact
  URL plus any genuine remaining caveat without touching the tracked repo.
  [needs:dist/main.js + dist/main.css]
