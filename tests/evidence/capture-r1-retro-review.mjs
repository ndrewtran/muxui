// Decision 0022 amendment 01: retain the retroactive independent reviews of
// the R1.2, R1.3, and R1.4 families and record how each finding is resolved.
//
// First capture (sanitizes and retains the four reviewer reports):
//   node tests/evidence/capture-r1-retro-review.mjs --reports=<dir> --capture-timestamp=<ISO-8601 UTC>
// Record fix commits once the fixes are merged (repeatable; refs are
// `<lane>/<finding>`, `<lane>/*`, or `*`, comma-separated):
//   node tests/evidence/capture-r1-retro-review.mjs --resolve=r1.2-fields/H1,r1.2-fields/H2=<commit>
//   node tests/evidence/capture-r1-retro-review.mjs --accept=r1.4-overlays/L5="<reason it stays unfixed>" --accepted-by="<decision owner>" [--tracked-to=S1.0]
// Only the decision owner (Decision 0022 amendment 01) may accept a finding.
// Without --reports, the retained artifacts are reused and must still match
// their recorded digests; only records and the index are rewritten, and every
// earlier resolution is preserved.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson } from '../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { hasUnsanitizedEvidenceOutput } from '../../tooling/audits/repository-policy/src/evidence-verify.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const root = 'tests/evidence/r1-retro-review';
const captureTool = 'tests/evidence/capture-r1-retro-review.mjs';
const authority = 'muxui:decision:0022:amendment:01';
const reviewedRevision = '81e4c7bcc90ad5b4282a12d3a30ee38e47588fa3';
const reviewedTree = 'b489a4c97cab20c29cf1860ea939577813ab558c';
const lenses = ['authority and scope', 'renderer behaviour', 'catalog and generation', 'proof', 'release integrity'];

// One lane per reviewer report. `families` is the lane's review scope;
// `reportTable` records a family-table verdict only where it differs from the
// verdict derived from the findings that name the family. Severities follow
// the report's High/Medium/Low sections; `counts` is the report's own total.
const lanes = [
  {
    lane: 'r1.2-fields',
    milestone: 'R1.2',
    pullRequest: 105,
    families: ['Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker', 'DateRangePicker', 'Form', 'NumberField', 'SearchField', 'Switch', 'TextField', 'TimeField'],
    counts: { high: 5, medium: 7, low: 5 },
    findings: [
      ['H1', 'high', ['DateField', 'DatePicker', 'TimeField', 'DateRangePicker'], 'Clearing a controlled temporal field shows the old value, and DateField and DatePicker submit it.'],
      ['H2', 'high', ['CheckboxGroup'], 'A required CheckboxGroup submits with nothing checked under the default native Form.'],
      ['H3', 'high', ['Autocomplete'], 'A single Escape closes the suggestions and also wipes the typed text.'],
      ['H4', 'high', ['Autocomplete'], 'Enter on an active suggestion submits the form with the typed text.'],
      ['H5', 'high', ['Autocomplete'], 'Items with a label but no value submit their array index.'],
      ['M1', 'medium', ['CheckboxGroup'], 'A CheckboxGroup with a non-string label has no accessible name.'],
      ['M2', 'medium', ['Autocomplete'], 'The open suggestion list is never exposed to assistive technology.'],
      ['M3', 'medium', ['SearchField', 'Switch', 'TextField'], 'Setting errorMessage makes the field permanently invalid.'],
      ['M4', 'medium', ['TimeField', 'DateRangePicker'], 'Server errors on TimeField and DateRangePicker do not clear when the user fixes the value.'],
      ['M5', 'medium', ['NumberField'], 'NumberField hard-codes inputMode="decimal", hiding the minus key on iPhone.'],
      ['M6', 'medium', ['Autocomplete'], 'Selecting a suggestion writes its value, not its label, into the visible input.'],
      ['M7', 'medium', ['Form', 'Autocomplete', 'CheckboxGroup', 'NumberField', 'SearchField', 'Switch'], 'Missing proof for controlled values, required submission, Autocomplete keyboard, SearchField Escape, errorMessage, server-error clearing, and FormData.'],
      ['L1', 'low', ['SearchField'], 'SearchField Escape does not fire onClear.'],
      ['L2', 'low', ['TimeField'], 'TimeField submits in two formats.'],
      ['L3', 'low', ['CheckboxGroup'], 'CheckboxGroup size CSS is dead.'],
      ['L4', 'low', ['Switch', 'Autocomplete'], 'Two catalog defaults are misleading.'],
      ['L5', 'low', ['Autocomplete'], 'The unmerged Autocomplete dismiss fix assumes Chromium behaviour.'],
    ],
    reportTable: {},
    notChecked: ['PR #105 body on GitHub', 'manual and assistive-technology testing (Decision 0022)', 'browsers other than Chromium', 'packed-artifact contents (release:prepare not run)', 'DatePicker and DateRangePicker calendar keyboard beyond the existing browser test', 'rendered Storybook stories'],
  },
  {
    lane: 'r1.3a-collections',
    milestone: 'R1.3',
    pullRequest: 106,
    families: ['ComboBox', 'GridList', 'ListBox', 'Menu', 'Select', 'Table', 'TagGroup', 'TokenField', 'Tree', 'Virtualizer', 'Tabs', 'Toolbar'],
    counts: { high: 3, medium: 4, low: 3 },
    findings: [
      ['H1', 'high', ['GridList', 'Tree', 'Table'], 'Clicking or pressing Enter never selects when nothing is selected yet.'],
      ['H2', 'high', ['TokenField'], 'Typed text is thrown away, so tokens can never be added.'],
      ['H3', 'high', ['ComboBox'], 'Disabled items can be selected and are submitted with the form.'],
      ['M1', 'medium', ['Tabs'], 'A disabled first tab is selected by default.'],
      ['M2', 'medium', ['TagGroup'], 'Tags announce they can be removed even when they cannot.'],
      ['M3', 'medium', ['Table'], 'Wrong cell content for common column ids.'],
      ['M4', 'medium', ['GridList', 'Tree', 'Table', 'TokenField', 'ComboBox', 'Tabs', 'TagGroup'], 'Missing proof that would have caught H1-H3 and M1-M2.'],
      ['L1', 'low', ['TokenField'], 'The TokenField placeholder is always visible and not tied to the textbox.'],
      ['L2', 'low', ['Select', 'ComboBox'], 'The form value ignores item.value.'],
      ['L3', 'low', ['Select'], 'A read-only Select still opens its list.'],
    ],
    reportTable: { Select: 'clear' },
    notChecked: ['PR #106 description text', 'manual and assistive-technology testing (Decision 0022)', 'ComboBox real-browser hydration and clearing', 'full check:all, remaining browser suites, Storybook axe matrix, packed tarball, and tsc type tests', 'Menu submenu hover timing and variable-height Virtualizer content'],
  },
  {
    lane: 'r1.3b-pickers',
    milestone: 'R1.3',
    pullRequest: 106,
    families: ['Calendar', 'RangeCalendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatch', 'ColorSwatchPicker', 'ColorWheel', 'RadioGroup', 'Slider', 'ToggleButtonGroup'],
    counts: { high: 2, medium: 6, low: 4 },
    findings: [
      ['F1', 'high', ['Slider', 'ColorSlider', 'ColorArea', 'ColorWheel', 'ColorSwatchPicker', 'ColorPicker'], 'Read-only scalar and colour controls trap keyboard focus (WCAG 2.1.2).'],
      ['F2', 'high', ['RadioGroup'], 'RadioGroup submits its value under a random generated key, and there is no way to name it.'],
      ['F3', 'medium', ['Slider'], 'Slider has no form participation.'],
      ['F4', 'medium', ['ColorField', 'Calendar', 'RangeCalendar', 'ColorSwatchPicker', 'ColorPicker'], 'Controlled empty values cannot be expressed, and clearing a controlled ColorField flips it to uncontrolled.'],
      ['F5', 'medium', ['Calendar', 'RangeCalendar'], 'Calendar and RangeCalendar hydration breaks when the server and client local dates differ.'],
      ['F6', 'medium', ['ColorSwatchPicker'], 'ColorSwatchPicker ignores item label, so the accessible name cannot be overridden.'],
      ['F7', 'medium', ['ColorSlider'], 'The ColorSlider catalog example is mislabelled, and the obvious fix crashes.'],
      ['F9', 'medium', ['Calendar', 'RangeCalendar', 'ColorArea', 'ColorSwatchPicker', 'ToggleButtonGroup', 'Slider'], 'Several keyboard contracts have no tests, and no family has a reset test.'],
      ['F8', 'low', ['ColorWheel'], 'ColorWheel silently drops label, then throws an error that asks for it.'],
      ['F10', 'low', ['ColorField', 'ColorArea', 'ColorSlider', 'ColorWheel', 'ColorPicker', 'ColorSwatchPicker'], 'Colour callbacks emit CSS rgba() strings in an unspecified format.'],
      ['F11', 'low', ['ColorArea', 'ColorSlider', 'ColorWheel', 'ColorSwatchPicker'], 'Untyped upstream props are forwarded.'],
      ['F12', 'low', ['ColorPicker', 'ColorSwatch', 'RadioGroup'], 'Dead or inert ARIA.'],
    ],
    reportTable: { ToggleButtonGroup: 'clear' },
    notChecked: ['PR #106 description and CI logs', 'manual and assistive-technology testing (Decision 0022)', 'non-en-US browser locales and RTL', 'visual, forced-colors, dark-mode rendering, and the Storybook axe matrix', 'check:all, packed tarball, and tsc type tests', 'whether the findings existed at PR #106'],
  },
  {
    lane: 'r1.4-overlays',
    milestone: 'R1.4',
    pullRequest: 107,
    families: ['Dialog', 'DropZone', 'FileTrigger', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip'],
    counts: { high: 3, medium: 8, low: 5 },
    findings: [
      ['H1', 'high', ['PreviewTrigger'], 'PreviewTrigger steals focus whenever the preview opens, by hover or by keyboard focus.'],
      ['H2', 'high', ['Toast'], 'Dismissing a Toast with the keyboard drops focus to body.'],
      ['H3', 'high', ['Toast'], 'A declarative Toast is torn down and re-added on every parent render unless every prop is referentially stable.'],
      ['M1', 'medium', ['Popover'], 'A non-modal Popover cannot be dismissed by an outside click, or by Escape on the trigger.'],
      ['M2', 'medium', ['Popover'], 'dismissable={false} on Popover can be bypassed.'],
      ['M3', 'medium', ['Toast'], 'Toast timers ignore hover that starts during the entry animation and can leak an unpausable timeout.'],
      ['M4', 'medium', ['Tooltip', 'PreviewTrigger'], 'disabled on Tooltip and PreviewTrigger marks the still-working trigger aria-disabled.'],
      ['M5', 'medium', ['DropZone'], 'DropZone onActivate fires from any nested control click, sometimes twice.'],
      ['M6', 'medium', ['Dialog'], 'An uncontrolled Dialog with dismissable={false} can never close.'],
      ['M7', 'medium', ['Dialog'], 'Focus is lost to body when the element that opened a Dialog unmounts while it is open.'],
      ['M8', 'medium', ['Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'DropZone', 'FileTrigger'], 'Missing proof for focus, dismissal, timing, drag-and-drop, and FileTrigger contracts.'],
      ['L1', 'low', ['Toast'], 'Toast duration is not validated.'],
      ['L2', 'low', ['Toast'], 'A declarative Toast whose onDismiss unmounts it cuts the exit animation short.'],
      ['L3', 'low', ['DropZone'], 'DropZone puts aria-disabled on a div with no role.'],
      ['L4', 'low', ['Toast'], 'normalizeMaxVisible silently turns invalid values into 5.'],
      ['L5', 'low', ['Dialog'], 'Dialog has no aria-modal; the catalog wording overstates modal semantics.'],
    ],
    reportTable: { FileTrigger: 'clear in its own code; causes the DropZone defect when nested' },
    notChecked: ['PR #107 full description and CI logs', 'manual and assistive-technology testing (Decision 0022)', 'browsers other than headless Chrome, touch long-press, and native drag-and-drop', 'Storybook a11y suite', 'server-rendered defaultOpen overlays', 'check:all and packed-artifact proof'],
  },
];

const argument = (name) => process.argv.filter((value) => value.startsWith(`--${name}=`)).map((value) => value.slice(name.length + 3));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const readJson = (path) => JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8'));
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/u;

function write(path, value) {
  const absolute = join(repositoryRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, value);
  return { path, sha256: sha256(readFileSync(absolute)) };
}

// Disclosure: reviewer scratch paths and example personal data never enter
// retained evidence. Every other byte of a report is kept.
const sanitizationRules = [
  'absolute temporary-directory scratch paths become <tmp>/',
  'email-shaped example literals become <example-email>',
];
function sanitize(text) {
  return text
    .replace(/(^|[\s'"(=`])\/tmp\//gu, '$1<tmp>/')
    .replace(new RegExp(emailPattern.source, 'gu'), '<example-email>');
}

function assertDisclosable(text, label) {
  if (hasUnsanitizedEvidenceOutput(text, repositoryRoot)) throw new Error(`R1_RETRO_UNSANITIZED: ${label}`);
  if (emailPattern.test(text)) throw new Error(`R1_RETRO_PERSONAL_DATA: ${label}`);
}

if (git('rev-parse', `${reviewedRevision}^{tree}`) !== reviewedTree) throw new Error('R1_RETRO_REVIEWED_TREE_MISMATCH');

const reportsDirectory = argument('reports')[0];
const verificationPath = `${root}/verification.json`;
let verification;
if (reportsDirectory) {
  const captureTimestamp = argument('capture-timestamp')[0];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(captureTimestamp ?? '')) {
    throw new Error('R1_RETRO_CAPTURE_TIMESTAMP_REQUIRED: pass --capture-timestamp=YYYY-MM-DDTHH:MM:SSZ');
  }
  const reports = lanes.map(({ lane }) => {
    const raw = readFileSync(join(reportsDirectory, `${lane}.md`), 'utf8');
    const text = sanitize(raw);
    assertDisclosable(text, lane);
    const artifact = write(`${root}/artifacts/${lane}.md`, text);
    return { lane, report: { bytes: Buffer.byteLength(raw), sha256: sha256(raw), retained: false }, artifact };
  });
  verification = {
    schema: 'muxui-evidence-validation-v1',
    captureProcedure: `node ${captureTool} --reports=<reviewer report directory> --capture-timestamp=${captureTimestamp}`,
    captureTimestamp,
    proofTool: { path: captureTool, sha256: sha256(readFileSync(join(repositoryRoot, captureTool))) },
    // The unsanitized reports stay outside the repository; their digests bind
    // each retained artifact to the exact reviewer output.
    reports,
    sanitizationRules,
    sourceRevision: reviewedRevision,
    sourceTree: reviewedTree,
  };
  assertDisclosable(canonicalJson(verification), 'verification');
  write(verificationPath, canonicalJson(verification));
} else {
  verification = readJson(verificationPath);
  for (const { artifact } of verification.reports) {
    if (sha256(readFileSync(join(repositoryRoot, artifact.path))) !== artifact.sha256) {
      throw new Error(`R1_RETRO_ARTIFACT_CHANGED: ${artifact.path} no longer matches its capture digest`);
    }
  }
}
const validation = { path: verificationPath, sha256: sha256(readFileSync(join(repositoryRoot, verificationPath))) };

// Resolutions: earlier values persist; --resolve and --accept override them.
const resolutions = new Map();
for (const { lane } of lanes) {
  const path = `${root}/records/${lane}.json`;
  if (!existsSync(join(repositoryRoot, path))) continue;
  for (const { id, resolution } of readJson(path).findings) resolutions.set(`${lane}/${id}`, resolution);
}
const allRefs = lanes.flatMap(({ lane, findings }) => findings.map(([id]) => `${lane}/${id}`));
function expandRefs(list) {
  return list.split(',').flatMap((ref) => {
    const matched = ref === '*' ? allRefs : ref.endsWith('/*') ? allRefs.filter((candidate) => candidate.startsWith(ref.slice(0, -1))) : allRefs.filter((candidate) => candidate === ref);
    if (matched.length === 0) throw new Error(`R1_RETRO_UNKNOWN_FINDING: ${ref}`);
    return matched;
  });
}
for (const value of argument('resolve')) {
  const separator = value.lastIndexOf('=');
  const commit = value.slice(separator + 1);
  if (separator < 0 || !/^[0-9a-f]{40}$/u.test(commit)) throw new Error(`R1_RETRO_RESOLVE_INVALID: ${value} needs <refs>=<40-character commit>`);
  // A fix commit must already be in this branch's history (rebase onto the merged fix first).
  try {
    git('merge-base', '--is-ancestor', commit, 'HEAD');
  } catch {
    throw new Error(`R1_RETRO_FIX_NOT_IN_HISTORY: ${commit} is not an ancestor of HEAD`);
  }
  for (const ref of expandRefs(value.slice(0, separator))) resolutions.set(ref, { status: 'fixed', fixCommit: commit });
}
const acceptedBy = argument('accepted-by')[0]?.trim();
const trackedTo = argument('tracked-to')[0]?.trim();
if (argument('accept').length !== 0 && !acceptedBy) throw new Error('R1_RETRO_ACCEPT_INVALID: --accept needs --accepted-by=<decision owner>');
for (const value of argument('accept')) {
  const separator = value.indexOf('=');
  const reason = value.slice(separator + 1).trim();
  if (separator < 0 || reason === '') throw new Error(`R1_RETRO_ACCEPT_INVALID: ${value} needs <refs>=<reason>`);
  for (const ref of expandRefs(value.slice(0, separator))) {
    resolutions.set(ref, { status: 'accepted-unfixed', fixCommit: null, reason, acceptedBy, ...(trackedTo ? { trackedTo } : {}) });
  }
}

const reviewer = {
  kind: 'retroactive independent review of the current code',
  harness: 'Claude Code',
  model: 'Claude Opus 5.5 (claude-opus-5-5)',
  access: 'read-only reviewer agent; no GitHub access; worktree left unchanged',
  independence: 'a different model and harness from the Codex automation that produced the R1 code and pull requests',
};
const claimBoundary = 'findings is not a pass. clear means the reviewer found nothing within the stated lenses, files, tests, and probes; it is not proof of correctness. A fixed resolution means a fix merged in pull request #204 with tests that fail without the fix, as reported in #204 and not retained evidence; independent reviewers checked those tests on the pull-request branch before merge, and nobody re-reviewed the code after merge. An accepted-unfixed resolution is the decision owner\'s acceptance, not a fix. Manual and assistive-technology testing remains unmet and deferred to S1.0 (Decision 0022). This is not a hosted review of the original pull request, which had none.';

const records = [];
for (const { lane, milestone, pullRequest, families, counts, findings, reportTable, notChecked } of lanes) {
  const artifact = verification.reports.find((report) => report.lane === lane)?.artifact;
  if (!artifact) throw new Error(`R1_RETRO_ARTIFACT_MISSING: ${lane}`);
  const severityCounts = { high: 0, medium: 0, low: 0 };
  for (const [, severity, named] of findings) {
    severityCounts[severity] += 1;
    const unknown = named.filter((family) => !families.includes(family));
    if (unknown.length !== 0) throw new Error(`R1_RETRO_FAMILY_UNKNOWN: ${lane} ${unknown.join(', ')}`);
  }
  if (canonicalJson(severityCounts) !== canonicalJson(counts)) throw new Error(`R1_RETRO_COUNT_MISMATCH: ${lane}`);
  const observation = readJson(`tests/evidence/${milestone.toLowerCase()}/artifacts/pull-request-${pullRequest}.json`);
  const record = canonicalJson({
    schema: 'muxui-evidence-record-v1',
    reviewId: lane,
    milestone,
    evidenceKind: 'retained-retroactive-review-report',
    basis: `${authority}: retroactive independent review of the current code for the ${milestone} families`,
    outcome: findings.length === 0 ? 'clear' : 'findings',
    claimBoundary,
    reviewedRevision,
    reviewedTree,
    executedRevision: reviewedRevision,
    executedTree: reviewedTree,
    executedIdentityBasis: 'declared equal to the reviewed revision and tree because the reviewers ran their tests and probes there; not observed separately',
    // tests/evidence/README.md step 3: owner-declared N/A for the proof-tool commit and tree.
    proofToolRevision: {
      status: 'not-applicable',
      reason: 'the capture tool is committed together with this evidence, so no earlier commit holds the exact tool; proofTool.sha256 binds its bytes',
    },
    reviewer,
    lenses,
    families: families.map((family) => {
      const named = findings.filter(([, , list]) => list.includes(family)).map(([id]) => id);
      return { family, verdict: named.length === 0 ? 'clear' : 'findings', findings: named, ...(reportTable[family] ? { reportTableVerdict: reportTable[family] } : {}) };
    }),
    findings: findings.map(([id, severity, named, summary]) => ({
      id,
      severity,
      families: named,
      summary,
      resolution: resolutions.get(`${lane}/${id}`) ?? { status: 'pending', fixCommit: null },
    })),
    severityCounts,
    notChecked,
    manualAndAssistiveTechnology: { status: 'unmet', deferredTo: 'S1.0', authority: 'muxui:decision:0022' },
    originalPullRequest: {
      number: pullRequest,
      observation: `tests/evidence/${milestone.toLowerCase()}/artifacts/pull-request-${pullRequest}.json`,
      hostedReviews: observation.hostedReviews,
    },
    sourceRevision: reviewedRevision,
    sourceTree: reviewedTree,
    proofTool: verification.proofTool,
    artifact,
    validation,
    activeExceptionRefs: [],
    advisoryRefs: [],
    disclosureClass: 'public-sanitized',
    owner: 'ndrewtran',
    captureTimestamp: verification.captureTimestamp,
    retentionPolicy: 'Content-addressed Git records retained in default-branch history; reviewer scratch files and agent transcripts are not retained',
    expiry: 'Retained as historical R1 review evidence for the reviewed commit; a later code change needs a new review rather than an edit. Only the resolution of each finding is updated, by this tool.',
  });
  assertDisclosable(record, lane);
  records.push({ reviewId: lane, ...write(`${root}/records/${lane}.json`, record) });
}

write(`${root}/index.json`, canonicalJson({
  schema: 'muxui-evidence-index-v1',
  milestones: ['R1.2', 'R1.3', 'R1.4'],
  authority,
  sourceRevision: reviewedRevision,
  sourceTree: reviewedTree,
  artifacts: verification.reports.map(({ artifact }) => artifact),
  records,
  validation,
  disclosureClass: 'public-sanitized',
  owner: 'ndrewtran',
  captureTimestamp: verification.captureTimestamp,
  retentionPolicy: 'Content-addressed Git records retained in default-branch history; unsanitized reports stay outside the repository and are bound by digest',
}));

const pending = allRefs.filter((ref) => (resolutions.get(ref)?.status ?? 'pending') === 'pending');
console.log(`[r1-retro-review] ${records.length} lane records, ${allRefs.length} findings, ${pending.length} pending resolution`);
