# Decision 0022: rc.1 assistive-technology non-claim and R1 evidence deferral

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0022`
- Amends: Decision 0011 (before-export manual/AT rule, 0011:72–75) for the rc prerelease on `next`
- Accepted request: [acceptance record](./0022-rc1-assistive-technology-non-claim-acceptance.md)

## Decision

`@muxui/react@0.1.0-rc.1` on the `next` dist-tag claims no
assistive-technology support. Assistive-technology evidence is required
before Mux UI makes any assistive-technology claim, and before stable React
promotion (`S1.0`).

This narrows the support claim. It does not lower the accessibility contract.
Every existing accessibility check stays required, including axe, keyboard,
focus, accessible names, roles, states, and decorative-icon semantics.

## Unmet R1 evidence

A read-only audit of every R1 milestone found that the evidence below was
never recorded. No component declares an Architecture risk class, and the
repository retains no `E-R1.x` evidence records. Each item is therefore
**unmet**. None of it passed, and no completion claim rests on it.

| Evidence | Milestone and change | What exists | Unmet part | Families |
| --- | --- | --- | --- | --- |
| `E-R1.1-04` | R1.1, PR #102 | Browser and axe matrix | Manual half, provisional: applies if `DisclosureGroup`'s risk class is declared Composite | `DisclosureGroup` |
| `E-R1.2-03` | R1.2, PR #105 | Automated checks only | Manual and assistive-technology half | `Autocomplete`, `CheckboxGroup`, `DatePicker`, `DateRangePicker`, `Form` |
| `E-R1.3-04` | R1.3, PR #106 | Browser and axe matrix, plus review | Manual and assistive-technology half | `Calendar`, `ColorArea`, `ColorPicker`, `ColorSlider`, `ColorSwatchPicker`, `ColorWheel`, `ComboBox`, `GridList`, `ListBox`, `Menu`, `RadioGroup`, `RangeCalendar`, `Select`, `Slider`, `Table`, `Tabs`, `TagGroup`, `ToggleButtonGroup`, `TokenField`, `Toolbar`, `Tree`, `Virtualizer` |
| `E-R1.4-04` | R1.4, issue #79 closed by PR #107 | Package tests, release preparation, Chrome 151 interaction and axe matrix, independent review | Manual and assistive-technology proof | `Dialog`, `DropZone`, `FileTrigger`, `Popover`, `PreviewTrigger`, `Toast`, `Tooltip` |
| `E-R1.5-03` | R1.5, PR #108 | Visual contract proof | Risk-profile half: no binding declares a risk profile, so the proof cannot exist | Every exported binding |

The family lists are a reading of Architecture's risk-class table and Decision
0011, because no binding declares its class. `ColorSwatch` and `ColorField`
are probably Static or Interactive and are not listed. `CheckboxGroup` and
`Form` are listed for validation announcement.

R1.1 through R1.5's recorded checks and reviews exist only as CI check and
review logs, such as PR #108's for `E-R1.5-01` through `E-R1.5-06`. Those logs
are not retained evidence, expire around 2026-11-23, and cannot satisfy an
exit. Capturing them into retained evidence is a required R1 exit entry
condition and a required step before the rc.1 cut, done before the logs
expire. Until then the generated records mark R1.5 evidence
`logged-not-retained`, not recorded.

## Prerelease amendment

For the prerelease, each unmet item is recorded as **deferred to stable
promotion (`S1.0`)**, not passed. Each affected milestone exit gains a
prerelease amendment: an rc on `next` may export the listed families with
assistive-technology support explicitly unproved and not claimed. For each of
R1.1 through R1.5: the milestone is complete for the rc prerelease boundary on
its logged evidence, which must be captured into retained evidence before the
R1 exit; the deferred item is a required `S1.0` entry condition. This narrows
support and records the missing evidence; it does not turn missing evidence
into a pass.

This is an amendment to the milestone exit rules, not an
`OperationalExceptionRecord`. It suppresses no accessibility or safety check,
and `release.json` keeps `exceptions: []`.

Before `S1.0`, the deferred items above are required entry conditions.
Architecture's risk-class table, which derives promotion evidence from a
declared interaction risk class, is also the basis for requiring every
exported component to declare its risk class and pass the manual and
assistive-technology evidence that class requires before `S1.0`. That covers
at least every family in the table above, plus supplemental overlays and
composites such as `AlertDialog`, `CommandPalette`, `Lightbox`,
`MultiSelect`, `TagSelect`, and `Sidebar`.

## Authority effect

This decision amends Decision 0011's before-export manual and
assistive-technology rule (0011:72–75) for the rc prerelease on `next` only.
Decision 0011 still governs every other release.

Every rc.1 binding is exported. Their assistive-technology support is
unproved and not claimed. The rc.1 package, dist-tag, exports, lifecycle, and
release boundary do not change. `SCOPE-QUALITY-COMPAT-PROFILE` and
`SCOPE-PRODUCT-REACT-PRERELEASE` keep their commitments. The rc.1
compatibility profile states the non-claim explicitly rather than implying
assistive-technology coverage.

Amending the R1.1 through R1.5 exit rules and the React `0.1`
release-acceptance requirement that manual and assistive-technology evidence
exist before export changes a committed release boundary. Product Scope
therefore records this decision under the `13.0.0` major version. The Roadmap
adds the deferred evidence and the risk-class declaration to the `S1.0`
stable-promotion conditions.

## Canonical statements

`packages/react/src/r1-deferred-evidence.mjs` lists the deferred items and
their families. The `@muxui/react` generator projects it into the
compatibility profile and release manifest, which state that the
assistive-technology claim is `none`, cite this decision, name the evidence
required before an assistive-technology claim or stable promotion, and list
every deferred item with its families. The R1.5 closure record lists, for each
family, every deferred item that covers it, and marks R1.5 evidence
`logged-not-retained`. The R1 contract check verifies those projections.
Generated output is never edited directly.

## Reversal

A later decision may make an assistive-technology claim only with evidence for
the exact assistive technologies, browsers, and bindings it names. Historical
records are not rewritten.
