# Decision 0032: P2.1 publishes schema, catalog, and tooling beside React, and tokens stay private

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0032`
- Amends: the Architecture, Roadmap, and Product Scope passages listed under "Authority effect"
- Amended: 4 November 2026, item 10 only (trusted publishers move to each package's next real release); see "Amendment"
- Effective: on merge

## Gap

P2.1 publishes packages, so the authority chain has to agree on which ones. It
does not. Measured on `main` at `ddbd687a`:

- **Three documents name three different sets.** Product Scope says that at R1
  only `@muxui/react` is publishable, that schema, tokens, catalog, and tooling
  "remain private build/proof authorities", and that Productization "later
  publishes the compatible portfolio". Architecture says Productization "later
  publishes the compatible catalog/tooling portfolio". The Roadmap says P2.1
  "publishes compatible catalog/tooling packages", depends on "an accepted
  public package graph", has no P2.1 section, and gives `E-P2.1-01…06` no
  text. Only Product Scope lists `@muxui/schema` and `@muxui/tokens` as
  committed public-package rows. No document says which packages publish, which edges they
  have, or how their versions relate.
- **The code fixes part of the answer.**
  1. The resolver requires a project-declared `@muxui/catalog`
     (`MUXUI_CATALOG_NOT_DECLARED`), and tooling builds the query API from its
     own catalog dependency over that catalog's bundle. Catalog and tooling must
     be separate public packages.
  2. The catalog's `.` entry imports only the schema. `@muxui/tokens` enters
     through `./compiler`. Tooling's CLI never loads its authoring module, but
     tooling's `.` entry re-exports it, and authoring imports the catalog
     compiler. Publishing the entries as they are would put tokens in a
     consumer's install graph.
  3. Tooling's generated response types import `@muxui/schema/types`, so the
     schema must be installable.
  4. The catalog's package version must equal its `catalogVersion`, and a
     prerelease such as `2.1.0-rc.1` passes the version pattern.
  5. The packed React descriptor (`generated/descriptor.json`, no `muxUi`
     pointer) is not the shape the resolver reads (`muxUi.rendererDescriptor`
     pointing to `generated/renderer-descriptor.json`). Only synthetic fixtures
     exercise the real shape.
  6. The release machinery is built for one package. `release-prepare.mjs`
     requires exactly one private React source candidate, and the publish
     workflow takes a `0.1.0-rc.N` version and two artifact files.
  7. The schema, tokens, catalog, and tooling manifests have no `files`
     allowlist, licence, or repository field, and the schema, catalog, and
     tooling have no README.
  8. On the registry the schema, tokens, catalog, and tooling are unpublished
     (404). `@muxui/react` has `next` at `0.1.0-rc.4` and `latest` at
     `0.1.0-rc.1`.
- **Decision 0031 asked for an order.** Its item 20 wanted the API derivation,
  the CSS contract stages, and the platform-safety defaults in `main` before
  P2.1 accepts the graph, because that is when both contracts become a
  compatibility promise. The last of them, the platform-safety defaults, is in
  `main`.

## Decision

Part 1, the publish set and its edges:

1. **Publish set.** The P2.1 portfolio publishes exactly `@muxui/react`,
   `@muxui/schema`, `@muxui/catalog`, and `@muxui/tooling`. Nothing else in the
   workspace is published. The parked renderer packages stay parked
   (Decision 0031).
2. **Tokens stay private.** `@muxui/tokens` remains a private build authority.
   Its data reaches consumers inside the catalog bundle and its token sections,
   so no published package depends on it. Publishing it later, for example for
   the Tailwind consumer build or a design-tool profile, is a new package
   activation with its own decision.
3. **Runtime edges.** A packed manifest may depend on a Mux UI package only
   along these edges: catalog to schema, and tooling to catalog and schema.
   The schema and React depend on no Mux UI package. Third-party dependencies
   and peers are unchanged by this decision. Every dependency in a packed
   manifest is a registry package or a member of the publish set. None is a
   `workspace:` specifier, `@muxui/tokens`, or a parked package.
4. **Build-time edges stay in the workspace.** Tokens read the schema. The
   catalog compiler reads the schema and tokens and emits the bundle. The
   catalog's pattern imports read React. Tooling's authoring entry reads the
   catalog compiler and the schema. React's build reads the schema, the tokens,
   and the catalog compiler, which derives its renderer descriptor. No published
   manifest carries any of them, and React still depends on no Mux UI package at
   runtime.
5. **Public entries only, and compile entries stay out.** Each package exposes
   these entries, and its tarball holds no other:
   - `@muxui/schema`: `.`, `./schemas/*`, and `./types`.
   - `@muxui/catalog`: `.`, `./search`, `./bundle`, `./catalog.json`,
     `./catalog-package.json`, and `./token-section-page-budget-profile.json`.
   - `@muxui/tooling`: the `muxui` bin, `.`, `./resolver`, `./registry`, and
     `./types`.
   - `@muxui/react`: the entries its manifest exports today.

   The catalog compiler and the pattern-import and pattern-content entries
   (`./compiler`, `./pattern-imports`, `./pattern-content`) are workspace-only.
   So is tooling's maintainer-authoring entry: scaffolds, diagnostics, semantic
   diff, revision explanation, affected closure, and change-intent previews. It
   moves out of tooling's `.` entry into an entry that is not published. The
   repository's generators, tests, and maintainers keep using these entries from
   the workspace. `@muxui/schema`'s authoring helpers stay public, as
   `SCOPE-PKG-SCHEMA` commits.

Part 2, versions and release:

6. **Versions.** Each of the three new packages publishes only `-rc.N`
   prereleases, to `next`, with its own number. `@muxui/react` keeps its
   existing sequence (Decision 0023 and its amendment 01). The first rc of a package is a prerelease of the
   version its source manifest carries at the release commit, so the catalog
   starts at `2.1.0-rc.1`. Its package version must equal `catalogVersion`, so
   its `catalogVersion` is also a prerelease. The registry sets `latest` on a
   package's first publish, as it did for `@muxui/react` (Decision 0023). Mux UI
   neither claims nor promotes it, no stable release is promoted, and install
   guidance uses `@next`.
7. **Package versions are not contract versions.** A package version names a
   tarball. `schemaVersion`, `catalogVersion`, the query API version, the token
   contract version, and binding-spec revisions name contracts. Negotiation
   compares those and the renderer package ranges that bindings declare. A
   dependency range between published Mux UI packages is a package-manager
   request, not negotiation. The catalog is the one package whose version is a
   version unit: its package version is `catalogVersion`.
8. **Tooling's range on the catalog.** `@muxui/tooling` declares
   `@muxui/catalog` as a semver range bound to the query API major it reads,
   not an exact pin. The candidate set satisfies its own range (`E-P2.1-04`).
   What a CLI reads is a separate question that the resolver decides against the
   project-declared catalog: a newer CLI reads an older installed catalog whose
   supported query API versions include one the CLI reads, and returns
   `MUXUI_CATALOG_INCOMPATIBLE` for a schema-incompatible or unsupported one
   (`E-P2.1-05`). While only prereleases exist the range names a prerelease
   comparator. Under node-semver, `^2.1.0-rc.1` admits `2.1.0-rc.2` but not
   `2.2.0-rc.1`, so a prerelease with a new base version needs its own
   comparator.
9. **One release.** The first P2.1 portfolio release publishes all four
   packages from one commit under one release manifest. The single publish
   workflow is extended with a declared publish set and publishes in order:
   schema, catalog, tooling, React. Every later release keeps the existing
   rule that only the version units that changed are released (Architecture,
   "Version units and compatibility"). It publishes those packages in the same
   order, from one commit under one release manifest that correlates the whole
   tuple. The one-commit rule covers the packages a release publishes. A
   package it reuses keeps its original recorded version, digest, and
   provenance, and the manifest verifies its compatibility with the new tuple.
   No rule makes all four publish every time. Only a bad version is deprecated
   and fixed forward, as under Decision 0023 and its amendment 01, with its
   own authorization. A healthy published version stays published and is not
   deprecated. The prior tuple stays installable and
   verifiable by exact version: nothing is unpublished and the prior release
   manifests are retained. The first portfolio release has no prior tuple.
   Restoring the prior verifiable tuple, which Product Scope requires for
   Productization to be complete, stays owed by P2 exit.
10. **Trusted publishers.** Each of the three new packages needs its own npm
    trusted publisher, and setting it up takes Andrew's browser 2FA.
    - The first publish of schema, catalog, and tooling uses the temporary
      `NPM_TOKEN`. Once registry read-back verifies that release, Andrew
      revokes the token on npm and deletes the secret straight away. No
      trusted publisher is set up then.
    - Each new package's trusted publisher is set up immediately before that
      package's next real release, so it validates inside npm's 2-day window.
      A package with no change needs no setup. The setup and the publish each
      need Andrew's exact authorization.
    - Until a package's trusted publisher exists, a publish of that existing
      package stops on authentication and never falls back to a token. Only a
      package absent from the registry gets the token
      (`src/npm-publication.mjs`).
    - P2.1 can exit with tokenless publishing unproved for these three
      packages. Its evidence states as a non-claim that their trusted
      publishers are not yet set up and tokenless publishing is unproved for
      them. The provenance of the token publish proves neither.
      `@muxui/react` already publishes through its validated trusted
      publisher, so `E-P2.1-06` still requires that for React.

## Authority effect

- **Architecture** changes in the same pull request. "Public package graph"
  replaces the statement that schema, tokens, catalog, and tooling stay private
  with the P2.1 graph: a "Published at" column, one picture of the runtime and
  build-time edges, and items 1 to 5. "Catalog distribution and resolution"
  states the catalog-to-schema and tooling-to-catalog edges and that the compile
  entries are unpublished. "Version units and compatibility" states package
  version against contract version and the prerelease rule (items 6 to 9). The
  `@muxui/react` section says "workspace build authorities" where it said
  "private build authorities".
- **The Roadmap** names the packages in "Later tracks and Productization", adds
  a P2.1 section with its locked deliverables and the text of `E-P2.1-01…06`,
  cites this decision in the milestone register, and names `E-P2.1-01` and
  `E-P2.1-02` in the packed-descriptor row of the fixture ledger. Its `P2 exit`
  entry gains one sentence pointing to the Product Scope rollback line that P2
  exit owes. P2.1 is not made ready or active: its entry conditions and the
  activation packet stay.
- **Product Scope** takes a major version, `23.0.0`, under its own rule: "Add,
  remove, replace, or materially redefine a committed outcome, platform,
  release boundary, package, public surface, or non-goal". The transitions:
  - `SCOPE-PKG-SCHEMA`, `SCOPE-PKG-CATALOG`, and `SCOPE-PKG-TOOLING` stay
    `committed`. Each is now published at P2.1, with public entries only.
    `SCOPE-PKG-TOOLING` keeps maintainer authoring and change-intent previews
    as a workspace-only entry.
  - `SCOPE-PKG-TOKENS` stays `committed` as the private canonical owner of token
    data and transforms. Its publication at Productization, which "the
    compatible portfolio" implied, is removed. It is a later activation.
  - The "Public package scope" paragraph and the Productization and roadmap
    alignment rows state the publish set. The Productization completeness line
    "release rollback restores the prior verifiable tuple without rewriting
    historical records" is unchanged and stays owed by P2 exit.
  - No Scope ID is added, renumbered, reused, or removed.
  - Product outcome: a consumer installs a compatible schema, catalog, tooling,
    and React tuple from the registry and can verify it, with none of the
    workspace-only entries (the catalog's `./compiler` and `./pattern-*`, and
    tooling's authoring entry) in any of them. The schema's public authoring
    helpers stay public.
  - Release additions: `@muxui/schema`, `@muxui/catalog`, and `@muxui/tooling`
    join the Productization release scope. Removals: `@muxui/tokens` leaves it.
  - Evidence effect: `E-P2.1-01…06` get text. No evidence ID is removed or
    weakened.
  - Open tracker work: the implementation steps in "Non-goals and preserved
    stops". This change creates no issue and edits no Project item.
- **Decision 0031** item 20 stops saying that the platform-safety defaults and
  the P2.1 graph are still to come.
- **`AGENTS.md` route maps** are unchanged.
- **Not edited here:** package manifests and `private` flags, package READMEs,
  licences, and `files` allowlists, the descriptor generator, the resolver,
  `release-prepare.mjs`, `npm-publish.yml`, `npm-publication.mjs`,
  `publish-guard.mjs`, and every other file the planning validator protects
  beyond the three strategy documents. A later pull request that edits a
  protected release file carries an `Authority change record` naming this
  decision.

## Non-goals and preserved stops

This decision publishes no package, creates no tag, changes no dist-tag, sets up
no trusted publisher, and writes to no registry. It accepts the graph. It does
not make P2.1 ready or active: the Roadmap entry conditions and activation
packet stand. Activating each new package (Decision 0028 item 6), every
publish, dist-tag change, deprecation, and the trusted-publisher setup stay
separate stops for Andrew, each with its own exact authorization.

It claims no stable, support, or assistive-technology property and no `latest`.
It changes no R1 exit evidence, release candidate, or rc sequence
(Decisions 0022 and 0023). `muxui plan`, `doctor`, `init`, and canonical
proposals stay absent or explicitly unavailable in every manifest. It does not
publish `@muxui/tokens`, `@muxui/foundation`, `@muxui/web`, or
`@muxui/react-native`, and it changes no token value or `@muxui/react`
dependency rule. It does not satisfy the Product Scope proof that release
rollback restores the prior verifiable tuple, which P2 exit owes. It edits
Decision 0031 only to bring item 20 up to date. It changes no manifest, so the
source manifests keep their `private: true` flags until an implementation pull
request.

Implementation is separate pull requests: the entry split and the publication
metadata of each new package, the declared publish set with the release
preparation and publish workflow changes, and the P2.1 activation packet. The
React descriptor in the shape the resolver reads is already in source (#411)
and first ships in the next React rc.

## Reversal

A successor decision may change any part, and each part reverses on its own.
Before a package's first publish, a part reverses by editing this decision and
the documents it names. A published version stays on the registry. Unpublishing
is only for a security or legal problem, with explicit authorization, inside
npm's 72-hour no-dependents window (Decision 0023), so leaving the set later
means deprecating the package. Publishing `@muxui/tokens`, or a package from the
rejected alternatives below, needs a successor decision and its own activation.

## Drafting choices for Andrew

These calls follow from Andrew's answers. Andrew confirmed choices 5 and 10
explicitly on 1 November 2026 (see Acceptance). The pull request review is where
he confirms or changes the rest.

1. The first rc of the schema and tooling is a prerelease of the version their
   source manifests carry at the release commit (item 6).
2. `@muxui/react` keeps its existing prerelease sequence (item 6).
3. Tooling's range and resolver negotiation are separate. The range is a
   package-manager request that the candidate satisfies, and what a CLI reads is
   decided by the resolver (item 8).
4. A range that must admit a prerelease names one, and a prerelease with a new
   base version needs its own comparator (item 8).
5. "One release for all four" is read as the first portfolio release. Later
   releases publish only the version units that changed, from one commit under
   one manifest. A reused package keeps its original version, digest, and
   provenance, and the manifest verifies its compatibility with the new tuple
   (item 9).
6. Recovery is per package, as under Decision 0023 and its amendment 01: only a
   bad version is deprecated and fixed forward, and healthy published versions
   stay. P2.1 proves the prior tuple stays installable by exact version, and
   the restore proof stays owed by P2 exit, as Andrew's second answer settles
   (item 9).
7. A packed manifest may depend only on a registry package or a member of the
   publish set (item 3).
8. The excluded entries are named, and the schema's public authoring helpers
   stay public (item 5).
9. `SCOPE-PKG-TOKENS` keeps its ID and `committed` state, and publishing tokens
   is a later activation, not a new Scope ID.
10. The `SCOPE-PKG-TOOLING` row and the Architecture package table mark
    maintainer authoring and change-intent previews as a workspace-only entry.
11. The source manifests keep `private: true` until an implementation pull
    request (Non-goals).
12. CLI-as-documentation has no assertion of its own: `E-P2.1-02` carries it, so
    the six evidence IDs stay six. The text of `E-P2.1-01…06` is modelled on the
    retired `E-G2.1-01…05`, with a sixth assertion for publication that adds
    simulated refusals and a partial-publication rehearsal.
13. Decision 0031 item 20 is brought up to date, and Architecture says
    "workspace build authorities" where it said "private build authorities".
    Both are wording, with no change of rule.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 1 November 2026

Andrew's choices, in his words, each given as the recommended option of its question:

- "The P2.1 package-graph draft needs seven decisions (package shape, the tokens scope effect, versions, release shape, unpublished compiler, the tooling-to-catalog range, trusted-publisher timing). How do you want to settle them?" answered "Take all seven (Recommended)", whose option text was: "Publish schema, catalog and tooling beside react; tokens private (Product Scope 23.0.0); rc.N on next; one release for all four; compiler unpublished; ranged dependency; publishers at first publish. I draft the decision PR for your review. Nothing publishes."
- A second question, also on 1 November 2026: "Product Scope says Productization is complete only when "release rollback restores the prior verifiable tuple", but the P2.1 draft recovers a bad release by deprecating it and publishing a fix (as React does under Decision 0023). How should the decision reconcile them?" answered "Defer restore to P2 exit (Recommended)", whose option text was: "P2.1 deprecates only the bad version and fixes forward, like React. Its evidence also proves the prior set stays installable and verifiable by exact version. The restore proof stays owed by P2 exit. No Product Scope commitment changes."
- A third question, also on 1 November 2026: "PR #410 (package-graph decision): Astra and I both recommend two small wording fixes first: drop the "add no commitment" claim, and record that React's build reads the catalog compiler. Then merge after #411. Choices 5 (all four packages ship only in the first release) and 10 (maintainer authoring stays unpublished) would count as confirmed. What should I do?" answered "Fix, then merge after #411 (Recommended)", whose option text was: "I make the two wording fixes on the branch, re-run its checks, and squash-merge it once #411 is in. Choices 5 and 10 count as confirmed by you."

The first answer's seven, and where this record states each:

1. Package shape: schema, catalog, and tooling become public beside React, and
   tokens stay private (items 1 to 4).
2. The tokens scope effect: leaving tokens unpublished is a Product Scope major
   effect, `22.0.0` to `23.0.0` (Authority effect).
3. Versions: `-rc.N` on `next`, independent numbers, the catalog at
   `2.1.0-rc.1`, and no `latest` claim (items 6 and 7).
4. Release shape: one release for all four from one commit, one manifest, and
   ordered publishing, read as the first portfolio release (item 9).
5. The catalog compiler and the tooling authoring entry stay unpublished
   (item 5).
6. Tooling's dependency on the catalog is a range bound to the query API major
   (item 8).
7. Trusted publishers are set up with Andrew's browser 2FA close to the first
   publish (item 10).

The second answer is stated in item 9, and in the Non-goals and preserved
stops. The third answer confirms drafting choices 5 and 10.

The alternatives the draft weighed and this record does not adopt: publishing
tokens as a fifth package, vendoring the schema into the catalog so that three
packages publish, and, rejected in the draft, publishing tooling alone with the
catalog bundled, which breaks the project-declared catalog rule.

This record does not claim that any check passed, that any package, release
candidate, or dist-tag changed, or that P2.1 is ready or active. Where it
describes the code, it describes `main` at `ddbd687a`.

## Amendment

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 4 November 2026

Item 10 asked for each new package's trusted publisher to be set up close to
its first publish, and the README's publish order set it up right after the
token-authenticated first publish, before the token was revoked. That does not
hold. npm expires a trusted publisher that
has not completed a successful publish within 2 days
(https://docs.npmjs.com/trusted-publishers), and a second release just to use
it is not possible. Item 9 releases only the units that changed, the version
check rejects a bump with no contract change (`P2_1_VERSION_UNIT_UNCHANGED` in
`tooling/audits/repository-policy/src/release-effects.mjs`), and release
preparation still packs all four packages.

Andrew's choice, in his words, on 4 November 2026 was "Set up at next real
release (Recommended)", whose option text was: "I open a PR amending the
Roadmap, Decision 0032 and the README, merged before the dry run. P2.1 can
finish with tokenless publishing unproved for these three packages, and the
record says so."

The amendment changes:

- Item 10, as rewritten above.
- The Roadmap's P2.1 deliverable and the trusted-publisher clause of
  `E-P2.1-06`, the publish-order paragraph of the repository-policy README, and
  the header comment of `npm-publish.yml`, so they agree with item 10. Product
  Scope is unchanged: no commitment, package, or release boundary moves.

It does not change the Acceptance above, which records what Andrew accepted on
1 November 2026, nor any workflow logic or code. Rehearsal, read-back, the
refusals, the partial-publication rehearsal, and per-release authorization stay
in P2.1. This amendment publishes nothing and sets up no trusted publisher.
